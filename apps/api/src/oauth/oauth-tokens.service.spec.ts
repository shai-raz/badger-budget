import { NotFoundException } from "@nestjs/common";
import { OAuthConfigService } from "./oauth-config.service";
import { sha256Hex } from "./oauth-crypto";
import { OAuthError } from "./oauth-error";
import { OAuthTokensService } from "./oauth-tokens.service";
import { createHash } from "crypto";

const NOW = new Date("2026-10-05T12:00:00.000Z");
const VERIFIER = "v".repeat(50);
const CHALLENGE = createHash("sha256").update(VERIFIER).digest("base64url");
const REDIRECT = "https://claude.ai/api/mcp/auth_callback";
const RESOURCE = "https://api.example.com/api/v1/mcp";
const RAW_CODE = "bdg_ac_rawcodevalue";
const RAW_RT = "bdg_rt_rawrefresh";
const RAW_AT = "bdg_at_rawaccess";

const model = () => ({
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn().mockResolvedValue([]),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
});

async function rejection(p: Promise<unknown>): Promise<OAuthError> {
    try {
        await p;
    } catch (e) {
        return e as OAuthError;
    }
    throw new Error("expected rejection");
}

describe("OAuthTokensService", () => {
    const original = { ...process.env };
    let prisma: Record<string, ReturnType<typeof model> | jest.Mock>;
    let m: Record<string, ReturnType<typeof model>>;
    let service: OAuthTokensService;
    let revokeGrantSpy: jest.SpyInstance;

    const grant = {
        id: "grant-1",
        userId: "user-1",
        scope: "read",
        resource: RESOURCE,
        revokedAt: null as Date | null,
        lastUsedAt: null as Date | null,
        createdAt: new Date("2026-10-01T00:00:00.000Z"),
        client: { id: "client-row", clientId: "mcp_x", clientName: "Test Client" },
        user: { id: "user-1", deletedAt: null as Date | null },
    };

    const codeRow = (over: Record<string, unknown> = {}) => ({
        id: "code-1",
        codeHash: sha256Hex(RAW_CODE),
        grantId: "grant-1",
        codeChallenge: CHALLENGE,
        redirectUri: REDIRECT,
        expiresAt: new Date(NOW.getTime() + 60_000),
        usedAt: null,
        grant: { ...grant },
        ...over,
    });

    const codeParams = (over: Record<string, unknown> = {}) => ({
        grant_type: "authorization_code",
        code: RAW_CODE,
        redirect_uri: REDIRECT,
        code_verifier: VERIFIER,
        client_id: "mcp_x",
        ...over,
    });

    const rtRow = (over: Record<string, unknown> = {}) => ({
        id: "rt-1",
        tokenHash: sha256Hex(RAW_RT),
        grantId: "grant-1",
        expiresAt: new Date(NOW.getTime() + 86_400_000),
        rotatedAt: null as Date | null,
        replacedById: null as string | null,
        graceUsedAt: null as Date | null,
        revokedAt: null as Date | null,
        grant: { ...grant },
        ...over,
    });

    const refreshParams = (over: Record<string, unknown> = {}) => ({
        grant_type: "refresh_token",
        refresh_token: RAW_RT,
        client_id: "mcp_x",
        ...over,
    });

    beforeEach(() => {
        jest.useFakeTimers().setSystemTime(NOW);
        process.env.API_PUBLIC_URL = "https://api.example.com";
        m = {
            oAuthAuthorizationCode: model(),
            oAuthAuthorizationRequest: model(),
            oAuthRefreshToken: model(),
            oAuthAccessToken: model(),
            oAuthGrant: model(),
        };
        m.oAuthRefreshToken.create.mockResolvedValue({ id: "rt-new" });
        m.oAuthAccessToken.create.mockResolvedValue({ id: "at-new" });
        prisma = { ...m, $transaction: jest.fn((fn: (t: unknown) => unknown) => fn(prisma)) };
        service = new OAuthTokensService(prisma as never, new OAuthConfigService());
        // Keep the opportunistic purge out of the way except in its own test.
        (service as unknown as { lastPurgeAt: number }).lastPurgeAt = NOW.getTime();
        revokeGrantSpy = jest.spyOn(service, "revokeGrant");
    });

    afterEach(() => {
        jest.useRealTimers();
        process.env = { ...original };
    });

    describe("exchangeCode (AC5)", () => {
        it("issues a token pair once", async () => {
            m.oAuthAuthorizationCode.findUnique.mockResolvedValue(codeRow());
            const res = await service.exchangeCode(codeParams());
            expect(res).toMatchObject({ token_type: "Bearer", expires_in: 3600, scope: "read" });
            expect(res.access_token).toMatch(/^bdg_at_/);
            expect(res.refresh_token).toMatch(/^bdg_rt_/);
            expect(res).not.toHaveProperty("refreshTokenId");
            expect(m.oAuthAuthorizationCode.updateMany).toHaveBeenCalledWith({
                where: { id: "code-1", usedAt: null },
                data: { usedAt: NOW },
            });
        });

        it("revokes the grant and fails when the code was already used", async () => {
            m.oAuthAuthorizationCode.findUnique.mockResolvedValue(codeRow());
            m.oAuthAuthorizationCode.updateMany.mockResolvedValue({ count: 0 });
            const err = await rejection(service.exchangeCode(codeParams()));
            expect(err.error).toBe("invalid_grant");
            expect(revokeGrantSpy).toHaveBeenCalledWith("grant-1");
            expect(m.oAuthAccessToken.create).not.toHaveBeenCalled();
        });

        it("rolls back code consumption when issuing fails, without revoking the grant", async () => {
            const tx = {
                oAuthAuthorizationCode: model(),
                oAuthRefreshToken: model(),
                oAuthAccessToken: model(),
                oAuthGrant: model(),
            };
            tx.oAuthAuthorizationCode.updateMany.mockResolvedValue({ count: 1 });
            tx.oAuthRefreshToken.create.mockResolvedValue({ id: "rt-new" });
            tx.oAuthAccessToken.create.mockRejectedValue(new Error("db down"));
            (prisma.$transaction as jest.Mock).mockImplementation((fn: (t: unknown) => unknown) => fn(tx));
            m.oAuthAuthorizationCode.findUnique.mockResolvedValue(codeRow());
            await expect(service.exchangeCode(codeParams())).rejects.toThrow("db down");
            expect(tx.oAuthAuthorizationCode.updateMany).toHaveBeenCalled();
            expect(m.oAuthAuthorizationCode.updateMany).not.toHaveBeenCalled();
            expect(revokeGrantSpy).not.toHaveBeenCalled();
        });

        it("rejects an unknown code", async () => {
            m.oAuthAuthorizationCode.findUnique.mockResolvedValue(null);
            expect((await rejection(service.exchangeCode(codeParams()))).error).toBe("invalid_grant");
        });

        it("rejects an expired code", async () => {
            m.oAuthAuthorizationCode.findUnique.mockResolvedValue(codeRow({ expiresAt: new Date(NOW.getTime() - 1) }));
            expect((await rejection(service.exchangeCode(codeParams()))).error).toBe("invalid_grant");
        });

        it("rejects a wrong verifier", async () => {
            m.oAuthAuthorizationCode.findUnique.mockResolvedValue(codeRow());
            const err = await rejection(service.exchangeCode(codeParams({ code_verifier: "w".repeat(50) })));
            expect(err.error).toBe("invalid_grant");
            expect(m.oAuthAuthorizationCode.updateMany).not.toHaveBeenCalled();
        });

        it("rejects a wrong redirect_uri", async () => {
            m.oAuthAuthorizationCode.findUnique.mockResolvedValue(codeRow());
            const err = await rejection(service.exchangeCode(codeParams({ redirect_uri: REDIRECT + "/" })));
            expect(err.error).toBe("invalid_grant");
        });

        it("rejects a wrong client_id", async () => {
            m.oAuthAuthorizationCode.findUnique.mockResolvedValue(codeRow());
            const err = await rejection(service.exchangeCode(codeParams({ client_id: "mcp_other" })));
            expect(err.error).toBe("invalid_grant");
        });

        it("rejects a mismatched resource with invalid_target but accepts a trailing slash", async () => {
            m.oAuthAuthorizationCode.findUnique.mockResolvedValue(codeRow());
            const err = await rejection(service.exchangeCode(codeParams({ resource: "https://evil.example/mcp" })));
            expect(err.error).toBe("invalid_target");
            await expect(service.exchangeCode(codeParams({ resource: RESOURCE + "/" }))).resolves.toBeDefined();
        });

        it("rejects a code whose grant is revoked", async () => {
            m.oAuthAuthorizationCode.findUnique.mockResolvedValue(
                codeRow({ grant: { ...grant, revokedAt: new Date() } }),
            );
            expect((await rejection(service.exchangeCode(codeParams()))).error).toBe("invalid_grant");
        });

        it("rejects a wrong grant_type", async () => {
            const err = await rejection(service.exchangeCode(codeParams({ grant_type: "password" })));
            expect(err.error).toBe("unsupported_grant_type");
        });
    });

    describe("refresh (AC6)", () => {
        it("rotates the token and returns a new pair", async () => {
            m.oAuthRefreshToken.findUnique.mockResolvedValue(rtRow());
            const res = await service.refresh(refreshParams());
            expect(res.refresh_token).toMatch(/^bdg_rt_/);
            expect(m.oAuthRefreshToken.updateMany).toHaveBeenCalledWith({
                where: { id: "rt-1", rotatedAt: null, revokedAt: null },
                data: { rotatedAt: NOW },
            });
            expect(m.oAuthRefreshToken.update).toHaveBeenCalledWith({
                where: { id: "rt-1" },
                data: { replacedById: "rt-new" },
            });
        });

        it("rejects an expired refresh token", async () => {
            m.oAuthRefreshToken.findUnique.mockResolvedValue(rtRow({ expiresAt: new Date(NOW.getTime() - 1) }));
            expect((await rejection(service.refresh(refreshParams()))).error).toBe("invalid_grant");
        });

        it("rejects an unknown, revoked or other-client token", async () => {
            m.oAuthRefreshToken.findUnique.mockResolvedValueOnce(null);
            expect((await rejection(service.refresh(refreshParams()))).error).toBe("invalid_grant");
            m.oAuthRefreshToken.findUnique.mockResolvedValueOnce(rtRow({ grant: { ...grant, revokedAt: new Date() } }));
            expect((await rejection(service.refresh(refreshParams()))).error).toBe("invalid_grant");
            m.oAuthRefreshToken.findUnique.mockResolvedValueOnce(rtRow());
            expect((await rejection(service.refresh(refreshParams({ client_id: "other" })))).error).toBe(
                "invalid_grant",
            );
        });

        it("rejects a scope outside the grant and a resource mismatch", async () => {
            m.oAuthRefreshToken.findUnique.mockResolvedValue(rtRow());
            expect((await rejection(service.refresh(refreshParams({ scope: "read write" })))).error).toBe(
                "invalid_scope",
            );
            expect((await rejection(service.refresh(refreshParams({ resource: "https://x.example" })))).error).toBe(
                "invalid_target",
            );
        });

        it("treats a revoked token on an active grant (grace-superseded) as reuse", async () => {
            m.oAuthRefreshToken.findUnique.mockResolvedValue(rtRow({ revokedAt: new Date() }));
            const err = await rejection(service.refresh(refreshParams()));
            expect(err.error).toBe("invalid_grant");
            expect(revokeGrantSpy).toHaveBeenCalledWith("grant-1");
        });

        const txModels = () => {
            const t = {
                oAuthRefreshToken: model(),
                oAuthAccessToken: model(),
                oAuthGrant: model(),
            };
            t.oAuthRefreshToken.create.mockResolvedValue({ id: "rt-new" });
            t.oAuthAccessToken.create.mockResolvedValue({ id: "at-new" });
            return t;
        };

        it("rotates inside the issuing transaction", async () => {
            const tx = txModels();
            (prisma.$transaction as jest.Mock).mockImplementation((fn: (t: unknown) => unknown) => fn(tx));
            m.oAuthRefreshToken.findUnique.mockResolvedValue(rtRow());
            await service.refresh(refreshParams());
            expect(prisma.$transaction).toHaveBeenCalledTimes(1);
            expect(tx.oAuthRefreshToken.updateMany).toHaveBeenCalledWith({
                where: { id: "rt-1", rotatedAt: null, revokedAt: null },
                data: { rotatedAt: expect.any(Date) },
            });
            expect(tx.oAuthRefreshToken.update).toHaveBeenCalledWith({
                where: { id: "rt-1" },
                data: { replacedById: "rt-new" },
            });
            // Nothing about the rotation may happen outside the transaction.
            expect(m.oAuthRefreshToken.updateMany).not.toHaveBeenCalled();
            expect(m.oAuthRefreshToken.update).not.toHaveBeenCalled();
        });

        it("propagates an issue failure without revoking the grant or treating it as reuse", async () => {
            const tx = txModels();
            tx.oAuthAccessToken.create.mockRejectedValue(new Error("db down"));
            (prisma.$transaction as jest.Mock).mockImplementation((fn: (t: unknown) => unknown) => fn(tx));
            const handleReuseSpy = jest.spyOn(service as never, "handleReuse");
            m.oAuthRefreshToken.findUnique.mockResolvedValue(rtRow());
            await expect(service.refresh(refreshParams())).rejects.toThrow("db down");
            expect(revokeGrantSpy).not.toHaveBeenCalled();
            expect(handleReuseSpy).not.toHaveBeenCalled();
        });

        it("treats a lost rotation race as reuse", async () => {
            m.oAuthRefreshToken.findUnique.mockResolvedValue(rtRow());
            m.oAuthRefreshToken.updateMany.mockResolvedValue({ count: 0 });
            const err = await rejection(service.refresh(refreshParams()));
            expect(err.error).toBe("invalid_grant");
            expect(revokeGrantSpy).toHaveBeenCalledWith("grant-1");
        });

        const rotated = (msAgo: number, over: Record<string, unknown> = {}) =>
            rtRow({
                rotatedAt: new Date(NOW.getTime() - msAgo),
                replacedById: "rt-succ",
                ...over,
            });

        it("grace: reuse within 30s with an unused successor yields a fresh pair", async () => {
            m.oAuthRefreshToken.findUnique
                .mockResolvedValueOnce(rotated(5_000))
                .mockResolvedValueOnce({ id: "rt-succ", rotatedAt: null, revokedAt: null });
            const res = await service.refresh(refreshParams());
            expect(res.access_token).toMatch(/^bdg_at_/);
            expect(m.oAuthRefreshToken.updateMany).toHaveBeenCalledWith({
                where: { id: "rt-1", graceUsedAt: null },
                data: { graceUsedAt: NOW },
            });
            expect(m.oAuthRefreshToken.updateMany).toHaveBeenCalledWith({
                where: { id: "rt-succ", revokedAt: null },
                data: { revokedAt: NOW },
            });
            expect(m.oAuthAccessToken.updateMany).toHaveBeenCalledWith({
                where: { refreshTokenId: "rt-succ", revokedAt: null },
                data: { revokedAt: NOW },
            });
            expect(m.oAuthRefreshToken.update).toHaveBeenCalledWith({
                where: { id: "rt-1" },
                data: { replacedById: "rt-new" },
            });
            expect(revokeGrantSpy).not.toHaveBeenCalled();
        });

        it("grace: claims graceUsedAt inside the transaction and propagates an issue failure without revoking", async () => {
            const tx = txModels();
            tx.oAuthRefreshToken.updateMany.mockResolvedValue({ count: 1 });
            tx.oAuthAccessToken.create.mockRejectedValue(new Error("db down"));
            (prisma.$transaction as jest.Mock).mockImplementation((fn: (t: unknown) => unknown) => fn(tx));
            m.oAuthRefreshToken.findUnique
                .mockResolvedValueOnce(rotated(5_000))
                .mockResolvedValueOnce({ id: "rt-succ", rotatedAt: null, revokedAt: null });
            await expect(service.refresh(refreshParams())).rejects.toThrow("db down");
            expect(tx.oAuthRefreshToken.updateMany).toHaveBeenCalledWith({
                where: { id: "rt-1", graceUsedAt: null },
                data: { graceUsedAt: expect.any(Date) },
            });
            expect(m.oAuthRefreshToken.updateMany).not.toHaveBeenCalled();
            expect(revokeGrantSpy).not.toHaveBeenCalled();
        });

        it("grace: losing the claim race revokes the grant", async () => {
            const tx = txModels();
            tx.oAuthRefreshToken.updateMany.mockResolvedValue({ count: 0 });
            (prisma.$transaction as jest.Mock).mockImplementation((fn: (t: unknown) => unknown) => fn(tx));
            m.oAuthRefreshToken.findUnique
                .mockResolvedValueOnce(rotated(5_000))
                .mockResolvedValueOnce({ id: "rt-succ", rotatedAt: null, revokedAt: null });
            const err = await rejection(service.refresh(refreshParams()));
            expect(err.error).toBe("invalid_grant");
            expect(revokeGrantSpy).toHaveBeenCalledWith("grant-1");
        });

        it("a second grace reuse revokes the grant", async () => {
            m.oAuthRefreshToken.findUnique.mockResolvedValue(rotated(5_000, { graceUsedAt: new Date() }));
            const err = await rejection(service.refresh(refreshParams()));
            expect(err.error).toBe("invalid_grant");
            expect(revokeGrantSpy).toHaveBeenCalledWith("grant-1");
        });

        it("reuse after 30s revokes the grant", async () => {
            m.oAuthRefreshToken.findUnique.mockResolvedValue(rotated(31_000));
            const err = await rejection(service.refresh(refreshParams()));
            expect(err.error).toBe("invalid_grant");
            expect(err.description).toMatch(/reuse/);
            expect(revokeGrantSpy).toHaveBeenCalledWith("grant-1");
        });

        it("reuse after the successor was used revokes the grant", async () => {
            m.oAuthRefreshToken.findUnique
                .mockResolvedValueOnce(rotated(5_000))
                .mockResolvedValueOnce({ id: "rt-succ", rotatedAt: new Date(), revokedAt: null });
            const err = await rejection(service.refresh(refreshParams()));
            expect(err.error).toBe("invalid_grant");
            expect(revokeGrantSpy).toHaveBeenCalledWith("grant-1");
        });
    });

    describe("validateAccessToken (AC7)", () => {
        const atRow = (over: Record<string, unknown> = {}, grantOver: Record<string, unknown> = {}) => ({
            id: "at-1",
            revokedAt: null,
            expiresAt: new Date(NOW.getTime() + 60_000),
            grant: { ...grant, ...grantOver },
            ...over,
        });

        it("returns the context on the happy path", async () => {
            m.oAuthAccessToken.findUnique.mockResolvedValue(atRow());
            const ctx = await service.validateAccessToken(RAW_AT);
            expect(ctx).toEqual({
                grantId: "grant-1",
                userId: "user-1",
                clientId: "mcp_x",
                scopes: ["read"],
                expiresAt: new Date(NOW.getTime() + 60_000),
                resource: RESOURCE,
            });
            expect(m.oAuthAccessToken.findUnique.mock.calls[0][0].where).toEqual({ tokenHash: sha256Hex(RAW_AT) });
        });

        it.each([
            ["unknown", null],
            ["expired", atRow({ expiresAt: new Date(NOW.getTime() - 1) })],
            ["revoked", atRow({ revokedAt: new Date() })],
            ["grant revoked", atRow({}, { revokedAt: new Date() })],
            ["user deleted", atRow({}, { user: { id: "user-1", deletedAt: new Date() } })],
            ["wrong resource", atRow({}, { resource: "https://api.example.com/other" })],
        ])("returns null for %s", async (_name, row) => {
            m.oAuthAccessToken.findUnique.mockResolvedValue(row);
            expect(await service.validateAccessToken(RAW_AT)).toBeNull();
        });

        it("returns null for a non-bdg_at_ string without touching the db", async () => {
            expect(await service.validateAccessToken("eyJhbGciOiJIUzI1NiJ9.e30.sig")).toBeNull();
            expect(m.oAuthAccessToken.findUnique).not.toHaveBeenCalled();
        });

        it("writes lastUsedAt only when stale", async () => {
            m.oAuthAccessToken.findUnique.mockResolvedValue(atRow({}, { lastUsedAt: null }));
            await service.validateAccessToken(RAW_AT);
            expect(m.oAuthGrant.updateMany).toHaveBeenCalledTimes(1);

            m.oAuthGrant.updateMany.mockClear();
            m.oAuthAccessToken.findUnique.mockResolvedValue(atRow({}, { lastUsedAt: new Date(NOW.getTime() - 5_000) }));
            await service.validateAccessToken(RAW_AT);
            expect(m.oAuthGrant.updateMany).not.toHaveBeenCalled();

            m.oAuthAccessToken.findUnique.mockResolvedValue(
                atRow({}, { lastUsedAt: new Date(NOW.getTime() - 61_000) }),
            );
            await service.validateAccessToken(RAW_AT);
            expect(m.oAuthGrant.updateMany).toHaveBeenCalledTimes(1);
        });

        it("swallows lastUsedAt write errors", async () => {
            m.oAuthAccessToken.findUnique.mockResolvedValue(atRow());
            m.oAuthGrant.updateMany.mockRejectedValue(new Error("db down"));
            await expect(service.validateAccessToken(RAW_AT)).resolves.not.toBeNull();
        });
    });

    describe("hashing (AC8)", () => {
        it("never persists raw secrets, only 64-char hex hashes", async () => {
            m.oAuthAuthorizationCode.findUnique.mockResolvedValue(codeRow());
            const res = await service.exchangeCode(codeParams());
            const creates = [...m.oAuthRefreshToken.create.mock.calls, ...m.oAuthAccessToken.create.mock.calls];
            expect(creates).toHaveLength(2);
            const serialized = JSON.stringify(creates);
            expect(serialized).not.toContain(res.access_token);
            expect(serialized).not.toContain(res.refresh_token);
            expect(m.oAuthRefreshToken.create.mock.calls[0][0].data.tokenHash).toBe(sha256Hex(res.refresh_token));
            expect(m.oAuthAccessToken.create.mock.calls[0][0].data.tokenHash).toBe(sha256Hex(res.access_token));
            for (const [arg] of creates) expect(arg.data.tokenHash).toMatch(/^[0-9a-f]{64}$/);
            // The code lookup is by hash, never raw.
            expect(JSON.stringify(m.oAuthAuthorizationCode.findUnique.mock.calls)).not.toContain(RAW_CODE);
        });
    });

    describe("connections (AC9)", () => {
        it("listConnections maps fields without secrets", async () => {
            m.oAuthGrant.findMany.mockResolvedValue([
                {
                    ...grant,
                    lastUsedAt: new Date("2026-10-04T00:00:00.000Z"),
                    client: { ...grant.client, redirectUris: [REDIRECT] },
                },
                { ...grant, id: "grant-2", lastUsedAt: null },
            ]);
            const list = await service.listConnections("user-1");
            expect(list).toEqual([
                {
                    id: "grant-1",
                    clientName: "Test Client",
                    createdAt: "2026-10-01T00:00:00.000Z",
                    lastUsedAt: "2026-10-04T00:00:00.000Z",
                    scopes: ["read"],
                },
                {
                    id: "grant-2",
                    clientName: "Test Client",
                    createdAt: "2026-10-01T00:00:00.000Z",
                    lastUsedAt: null,
                    scopes: ["read"],
                },
            ]);
            expect(m.oAuthGrant.findMany).toHaveBeenCalledWith({
                where: { userId: "user-1", revokedAt: null },
                include: { client: true },
                orderBy: { createdAt: "desc" },
            });
        });

        it("revokeConnection revokes the grant, after which tokens validate as null", async () => {
            m.oAuthGrant.findFirst.mockResolvedValue({ id: "grant-1" });
            await service.revokeConnection("user-1", "grant-1");
            expect(m.oAuthGrant.findFirst).toHaveBeenCalledWith({
                where: { id: "grant-1", userId: "user-1", revokedAt: null },
            });
            expect(m.oAuthGrant.updateMany).toHaveBeenCalledWith({
                where: { id: "grant-1", revokedAt: null },
                data: { revokedAt: NOW },
            });
            expect(m.oAuthRefreshToken.updateMany).toHaveBeenCalledWith({
                where: { grantId: "grant-1", revokedAt: null },
                data: { revokedAt: NOW },
            });
            expect(m.oAuthAccessToken.updateMany).toHaveBeenCalledWith({
                where: { grantId: "grant-1", revokedAt: null },
                data: { revokedAt: NOW },
            });

            m.oAuthAccessToken.findUnique.mockResolvedValue({
                id: "at-1",
                revokedAt: NOW,
                expiresAt: new Date(NOW.getTime() + 60_000),
                grant: { ...grant, revokedAt: NOW },
            });
            expect(await service.validateAccessToken(RAW_AT)).toBeNull();
        });

        it("throws NotFound for another user's grant", async () => {
            m.oAuthGrant.findFirst.mockResolvedValue(null);
            await expect(service.revokeConnection("user-2", "grant-1")).rejects.toBeInstanceOf(NotFoundException);
            expect(m.oAuthGrant.updateMany).not.toHaveBeenCalled();
        });
    });

    describe("revoke (RFC 7009)", () => {
        it("revokes only the access token for an access token", async () => {
            m.oAuthAccessToken.findUnique.mockResolvedValue({ id: "at-1", grantId: "grant-1", grant });
            await service.revoke({ token: RAW_AT });
            expect(m.oAuthAccessToken.updateMany).toHaveBeenCalledWith({
                where: { id: "at-1", revokedAt: null },
                data: { revokedAt: NOW },
            });
            expect(revokeGrantSpy).not.toHaveBeenCalled();
        });

        it("revokes the whole grant for a refresh token", async () => {
            m.oAuthAccessToken.findUnique.mockResolvedValue(null);
            m.oAuthRefreshToken.findUnique.mockResolvedValue({ id: "rt-1", grantId: "grant-1", grant });
            await service.revoke({ token: RAW_RT, token_type_hint: "refresh_token" });
            expect(revokeGrantSpy).toHaveBeenCalledWith("grant-1");
        });

        it("resolves for an unknown token", async () => {
            m.oAuthAccessToken.findUnique.mockResolvedValue(null);
            m.oAuthRefreshToken.findUnique.mockResolvedValue(null);
            await expect(service.revoke({ token: "nope" })).resolves.toBeUndefined();
            await expect(service.revoke({})).resolves.toBeUndefined();
            expect(revokeGrantSpy).not.toHaveBeenCalled();
        });

        it("silently ignores a client_id mismatch", async () => {
            m.oAuthAccessToken.findUnique.mockResolvedValue({ id: "at-1", grantId: "grant-1", grant });
            await service.revoke({ token: RAW_AT, client_id: "someone-else" });
            expect(m.oAuthAccessToken.updateMany).not.toHaveBeenCalled();
        });
    });

    describe("purge", () => {
        it("runs at most once per hour and swallows errors", async () => {
            (service as unknown as { lastPurgeAt: number }).lastPurgeAt = 0;
            m.oAuthAuthorizationCode.findUnique.mockResolvedValue(null);
            m.oAuthAuthorizationCode.deleteMany.mockRejectedValue(new Error("boom"));
            await rejection(service.exchangeCode(codeParams()));
            await rejection(service.exchangeCode(codeParams()));
            expect(m.oAuthAuthorizationCode.deleteMany).toHaveBeenCalledTimes(1);
        });

        it("deletes old rows and old revoked grants", async () => {
            await service.purgeExpired();
            const cutoff = new Date(NOW.getTime() - 86_400_000);
            expect(m.oAuthAuthorizationCode.deleteMany).toHaveBeenCalledWith({ where: { expiresAt: { lt: cutoff } } });
            expect(m.oAuthAccessToken.deleteMany).toHaveBeenCalledWith({ where: { expiresAt: { lt: cutoff } } });
            expect(m.oAuthRefreshToken.deleteMany).toHaveBeenCalledWith({ where: { expiresAt: { lt: cutoff } } });
            expect(m.oAuthAuthorizationRequest.deleteMany).toHaveBeenCalledWith({
                where: { expiresAt: { lt: cutoff } },
            });
            expect(m.oAuthGrant.deleteMany).toHaveBeenCalledWith({
                where: { revokedAt: { lt: new Date(NOW.getTime() - 30 * 86_400_000) } },
            });
        });
    });
});
