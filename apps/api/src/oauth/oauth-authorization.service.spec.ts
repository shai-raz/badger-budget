import { NotFoundException } from "@nestjs/common";
import { OAuthAuthorizationService } from "./oauth-authorization.service";
import { OAuthConfigService } from "./oauth-config.service";
import { OAuthError } from "./oauth-error";
import { sha256Hex } from "./oauth-crypto";

const CLAUDE_URI = "https://claude.ai/api/mcp/auth_callback";
const CHALLENGE = "a".repeat(43);

describe("OAuthAuthorizationService", () => {
    const original = { ...process.env };
    let config: OAuthConfigService;
    let tx: Record<string, Record<string, jest.Mock>>;
    let reqModel: Record<string, jest.Mock>;
    let prisma: { oAuthAuthorizationRequest: Record<string, jest.Mock>; $transaction: jest.Mock };
    let findByClientId: jest.Mock;
    let service: OAuthAuthorizationService;

    const client = { id: "client-row-id", clientId: "mcp_x", clientName: "Test Client", redirectUris: [CLAUDE_URI] };

    beforeEach(() => {
        process.env.API_PUBLIC_URL = "https://api.example.com";
        process.env.WEB_APP_URL = "https://app.example.com";
        config = new OAuthConfigService();
        tx = {
            oAuthGrant: {
                findMany: jest.fn().mockResolvedValue([]),
                updateMany: jest.fn(),
                create: jest.fn().mockResolvedValue({ id: "grant-1" }),
            },
            oAuthAccessToken: { updateMany: jest.fn() },
            oAuthRefreshToken: { updateMany: jest.fn() },
            oAuthAuthorizationCode: { create: jest.fn() },
            oAuthClient: { update: jest.fn() },
        };
        reqModel = {
            create: jest.fn(),
            findUnique: jest.fn(),
            updateMany: jest.fn(),
            deleteMany: jest.fn(),
        };
        prisma = {
            oAuthAuthorizationRequest: reqModel,
            $transaction: jest.fn((fn: (t: unknown) => unknown) => fn(tx)),
        };
        findByClientId = jest.fn().mockResolvedValue(client);
        service = new OAuthAuthorizationService(prisma as never, config, { findByClientId } as never);
    });

    afterEach(() => {
        process.env = { ...original };
    });

    const validQuery = (over: Record<string, unknown> = {}) => ({
        response_type: "code",
        client_id: "mcp_x",
        redirect_uri: CLAUDE_URI,
        code_challenge: CHALLENGE,
        code_challenge_method: "S256",
        state: "st-1",
        ...over,
    });

    describe("startAuthorization non-redirectable errors", () => {
        it("rejects unknown client", async () => {
            findByClientId.mockResolvedValue(null);
            await expect(service.startAuthorization(validQuery())).rejects.toBeInstanceOf(OAuthError);
            expect(reqModel.create).not.toHaveBeenCalled();
        });

        it("rejects missing client_id and array-valued client_id", async () => {
            await expect(service.startAuthorization(validQuery({ client_id: undefined }))).rejects.toBeInstanceOf(
                OAuthError,
            );
            await expect(service.startAuthorization(validQuery({ client_id: ["a", "b"] }))).rejects.toBeInstanceOf(
                OAuthError,
            );
        });

        it("rejects missing redirect_uri", async () => {
            await expect(service.startAuthorization(validQuery({ redirect_uri: undefined }))).rejects.toBeInstanceOf(
                OAuthError,
            );
        });

        it("rejects mismatched redirect_uri", async () => {
            await expect(
                service.startAuthorization(validQuery({ redirect_uri: "https://evil.example/cb" })),
            ).rejects.toBeInstanceOf(OAuthError);
            expect(reqModel.create).not.toHaveBeenCalled();
        });
    });

    it("accepts a loopback redirect with a different port", async () => {
        findByClientId.mockResolvedValue({ ...client, redirectUris: ["http://127.0.0.1/cb"] });
        const res = await service.startAuthorization(validQuery({ redirect_uri: "http://127.0.0.1:5555/cb" }));
        expect(res.redirectUrl).toContain("https://app.example.com/oauth/consent");
        expect(reqModel.create.mock.calls[0][0].data.redirectUri).toBe("http://127.0.0.1:5555/cb");
    });

    it("returns a 400 instead of redirecting errors to an unverified https redirect", async () => {
        findByClientId.mockResolvedValue({ ...client, redirectUris: ["https://evil.example/cb"] });
        await expect(
            service.startAuthorization(validQuery({ redirect_uri: "https://evil.example/cb", response_type: "token" })),
        ).rejects.toBeInstanceOf(OAuthError);
        expect(reqModel.create).not.toHaveBeenCalled();
    });

    it("still redirects errors to loopback and private-scheme redirects", async () => {
        findByClientId.mockResolvedValue({ ...client, redirectUris: ["cursor://anysphere/cb"] });
        const { redirectUrl } = await service.startAuthorization(
            validQuery({ redirect_uri: "cursor://anysphere/cb", response_type: "token" }),
        );
        expect(new URL(redirectUrl).searchParams.get("error")).toBe("unsupported_response_type");
    });

    describe("redirectable errors", () => {
        const cases: [string, Record<string, unknown>, string][] = [
            ["plain method", { code_challenge_method: "plain" }, "invalid_request"],
            ["missing method", { code_challenge_method: undefined }, "invalid_request"],
            ["missing challenge", { code_challenge: undefined }, "invalid_request"],
            ["wrong response_type", { response_type: "token" }, "unsupported_response_type"],
            ["bad scope", { scope: "read write" }, "invalid_scope"],
            ["wrong resource", { resource: "https://other.example/mcp" }, "invalid_target"],
        ];
        it.each(cases)("%s", async (_name, over, error) => {
            const { redirectUrl } = await service.startAuthorization(validQuery(over));
            const url = new URL(redirectUrl);
            expect(url.origin + url.pathname).toBe(CLAUDE_URI);
            expect(url.searchParams.get("error")).toBe(error);
            expect(url.searchParams.get("state")).toBe("st-1");
            expect(url.searchParams.get("iss")).toBe("https://api.example.com");
            expect(reqModel.create).not.toHaveBeenCalled();
        });
    });

    it("accepts the resource with a trailing slash and defaults scope to read", async () => {
        await service.startAuthorization(validQuery({ resource: "https://api.example.com/api/v1/mcp/" }));
        const data = reqModel.create.mock.calls[0][0].data;
        expect(data.resource).toBe("https://api.example.com/api/v1/mcp");
        expect(data.scope).toBe("read");
    });

    it("stores only the hash of the request id and returns the consent url with the raw id", async () => {
        const { redirectUrl } = await service.startAuthorization(validQuery());
        const raw = new URL(redirectUrl).searchParams.get("request") as string;
        expect(raw).toMatch(/^bdg_ar_/);
        const args = reqModel.create.mock.calls[0][0];
        expect(JSON.stringify(args)).not.toContain(raw);
        expect(args.data.requestHash).toBe(sha256Hex(raw));
        expect(args.data.clientId).toBe("client-row-id");
        expect(args.data.state).toBe("st-1");
        expect(args.data.expiresAt.getTime()).toBeGreaterThan(Date.now());
    });

    describe("getConsentRequest", () => {
        const row = (over: Record<string, unknown> = {}) => ({
            id: "r1",
            clientId: "client-row-id",
            client,
            redirectUri: CLAUDE_URI,
            scope: "read",
            userId: null,
            consumedAt: null,
            expiresAt: new Date(Date.now() + 60_000),
            ...over,
        });

        it("binds to the first user and returns display data", async () => {
            reqModel.findUnique.mockResolvedValue(row());
            reqModel.updateMany.mockResolvedValue({ count: 1 });
            const res = await service.getConsentRequest("raw", "u1");
            expect(reqModel.findUnique.mock.calls[0][0].where).toEqual({ requestHash: sha256Hex("raw") });
            expect(reqModel.updateMany).toHaveBeenCalledWith({
                where: { id: "r1", userId: null },
                data: { userId: "u1" },
            });
            expect(res).toEqual({
                clientName: "Test Client",
                redirectDisplay: "claude.ai",
                verified: true,
                loopback: false,
                scopes: ["read"],
                expiresAt: expect.any(String),
            });
        });

        it("flags loopback and unverified redirects", async () => {
            reqModel.findUnique.mockResolvedValue(row({ redirectUri: "http://127.0.0.1:5555/cb", userId: "u1" }));
            const res = await service.getConsentRequest("raw", "u1");
            expect(res.loopback).toBe(true);
            expect(res.verified).toBe(false);
            expect(res.redirectDisplay).toBe("127.0.0.1:5555");
            expect(reqModel.updateMany).not.toHaveBeenCalled();
        });

        it("rejects another user, expired, consumed and missing requests", async () => {
            reqModel.findUnique.mockResolvedValue(row({ userId: "other" }));
            await expect(service.getConsentRequest("raw", "u1")).rejects.toBeInstanceOf(NotFoundException);
            reqModel.findUnique.mockResolvedValue(row({ expiresAt: new Date(Date.now() - 1) }));
            await expect(service.getConsentRequest("raw", "u1")).rejects.toBeInstanceOf(NotFoundException);
            reqModel.findUnique.mockResolvedValue(row({ consumedAt: new Date() }));
            await expect(service.getConsentRequest("raw", "u1")).rejects.toBeInstanceOf(NotFoundException);
            reqModel.findUnique.mockResolvedValue(null);
            await expect(service.getConsentRequest("raw", "u1")).rejects.toBeInstanceOf(NotFoundException);
        });

        it("loses a bind race to another user", async () => {
            reqModel.findUnique.mockResolvedValueOnce(row()).mockResolvedValueOnce(row({ userId: "other" }));
            reqModel.updateMany.mockResolvedValue({ count: 0 });
            await expect(service.getConsentRequest("raw", "u1")).rejects.toBeInstanceOf(NotFoundException);
        });
    });

    describe("decide", () => {
        const stored = {
            id: "r1",
            clientId: "client-row-id",
            client,
            redirectUri: "http://127.0.0.1:5555/cb",
            codeChallenge: CHALLENGE,
            state: "st-1",
            scope: "read",
            resource: "https://api.example.com/api/v1/mcp",
        };

        beforeEach(() => {
            reqModel.updateMany.mockResolvedValue({ count: 1 });
            reqModel.findUnique.mockResolvedValue(stored);
        });

        it("deny redirects with access_denied and creates no grant or code", async () => {
            const { redirectUrl } = await service.decide("raw", "u1", false);
            const url = new URL(redirectUrl);
            expect(url.origin + url.pathname).toBe("http://127.0.0.1:5555/cb");
            expect(url.searchParams.get("error")).toBe("access_denied");
            expect(url.searchParams.get("state")).toBe("st-1");
            expect(url.searchParams.get("iss")).toBe("https://api.example.com");
            expect(url.searchParams.get("code")).toBeNull();
            expect(prisma.$transaction).not.toHaveBeenCalled();
            expect(tx.oAuthGrant.create).not.toHaveBeenCalled();
            expect(tx.oAuthAuthorizationCode.create).not.toHaveBeenCalled();
        });

        it("approve creates a grant, revokes the old one, stores the code hashed and redirects with it", async () => {
            tx.oAuthGrant.findMany.mockResolvedValue([{ id: "old-grant" }]);
            const { redirectUrl } = await service.decide("raw", "u1", true);

            const consumeWhere = reqModel.updateMany.mock.calls[0][0].where;
            expect(consumeWhere).toMatchObject({
                requestHash: sha256Hex("raw"),
                consumedAt: null,
                OR: [{ userId: null }, { userId: "u1" }],
            });

            expect(tx.oAuthGrant.updateMany).toHaveBeenCalledWith({
                where: { id: { in: ["old-grant"] } },
                data: { revokedAt: expect.any(Date) },
            });
            expect(tx.oAuthAccessToken.updateMany).toHaveBeenCalled();
            expect(tx.oAuthRefreshToken.updateMany).toHaveBeenCalled();
            expect(tx.oAuthGrant.create).toHaveBeenCalledWith({
                data: { userId: "u1", clientId: "client-row-id", scope: "read", resource: stored.resource },
            });
            expect(tx.oAuthClient.update).toHaveBeenCalled();

            const url = new URL(redirectUrl);
            expect(url.origin + url.pathname).toBe("http://127.0.0.1:5555/cb");
            const code = url.searchParams.get("code") as string;
            expect(code).toMatch(/^bdg_ac_/);
            expect(url.searchParams.get("state")).toBe("st-1");
            expect(url.searchParams.get("iss")).toBe("https://api.example.com");

            const codeArgs = tx.oAuthAuthorizationCode.create.mock.calls[0][0];
            expect(JSON.stringify(codeArgs)).not.toContain(code);
            expect(codeArgs.data).toMatchObject({
                codeHash: sha256Hex(code),
                grantId: "grant-1",
                codeChallenge: CHALLENGE,
                redirectUri: "http://127.0.0.1:5555/cb",
            });
        });

        it("approve without an existing grant does not revoke anything", async () => {
            await service.decide("raw", "u1", true);
            expect(tx.oAuthGrant.updateMany).not.toHaveBeenCalled();
        });

        it("second decide throws NotFound", async () => {
            reqModel.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
            await service.decide("raw", "u1", true);
            await expect(service.decide("raw", "u1", true)).rejects.toBeInstanceOf(NotFoundException);
        });
    });
});
