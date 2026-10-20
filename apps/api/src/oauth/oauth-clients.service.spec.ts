import { OAuthClientsService } from "./oauth-clients.service";
import { OAuthError } from "./oauth-error";
import { UNUSED_CLIENT_PRUNE_DAYS } from "./oauth.constants";

describe("OAuthClientsService", () => {
    let create: jest.Mock;
    let deleteMany: jest.Mock;
    let findUnique: jest.Mock;
    let service: OAuthClientsService;

    beforeEach(() => {
        create = jest.fn(async ({ data }) => ({ ...data, createdAt: new Date(1_700_000_000_000) }));
        deleteMany = jest.fn().mockResolvedValue({ count: 0 });
        findUnique = jest.fn();
        service = new OAuthClientsService({ oAuthClient: { create, deleteMany, findUnique } } as never);
    });

    afterEach(() => jest.restoreAllMocks());

    const code = async (body: Record<string, unknown>) => {
        try {
            await service.register(body);
        } catch (e) {
            return (e as OAuthError).error;
        }
        return null;
    };

    it("registers a valid client and ignores unknown fields", async () => {
        const res = await service.register({
            redirect_uris: ["https://claude.ai/api/mcp/auth_callback"],
            client_name: "  My Client  ",
            logo_uri: "https://evil",
            scope: "everything",
        });
        expect(create).toHaveBeenCalledWith({
            data: {
                clientId: expect.stringMatching(/^mcp_/),
                clientName: "My Client",
                redirectUris: ["https://claude.ai/api/mcp/auth_callback"],
            },
        });
        expect(res).toMatchObject({
            client_name: "My Client",
            client_id_issued_at: 1_700_000_000,
            grant_types: ["authorization_code", "refresh_token"],
            response_types: ["code"],
            token_endpoint_auth_method: "none",
        });
        expect(res).not.toHaveProperty("logo_uri");
    });

    it("strips control chars, truncates and defaults the name", async () => {
        const uris = ["https://a.com/cb"];
        await service.register({ redirect_uris: uris, client_name: "A\u0000B‮C\n" + "x".repeat(200) });
        expect(create.mock.calls[0][0].data.clientName).toBe(("ABC" + "x".repeat(200)).slice(0, 100));
        await service.register({ redirect_uris: uris, client_name: "\u0007 " });
        expect(create.mock.calls[1][0].data.clientName).toBe("Unnamed MCP client");
        await service.register({ redirect_uris: uris });
        expect(create.mock.calls[2][0].data.clientName).toBe("Unnamed MCP client");
    });

    it("rejects bad redirect_uris", async () => {
        expect(await code({})).toBe("invalid_redirect_uri");
        expect(await code({ redirect_uris: [] })).toBe("invalid_redirect_uri");
        expect(await code({ redirect_uris: "https://a.com" })).toBe("invalid_redirect_uri");
        expect(await code({ redirect_uris: Array(6).fill("https://a.com/cb") })).toBe("invalid_redirect_uri");
        expect(await code({ redirect_uris: ["http://example.com/cb"] })).toBe("invalid_redirect_uri");
        expect(await code({ redirect_uris: ["https://a.com/cb", "javascript:alert(1)"] })).toBe("invalid_redirect_uri");
        expect(create).not.toHaveBeenCalled();
    });

    it("rejects bad metadata", async () => {
        const base = { redirect_uris: ["https://a.com/cb"] };
        expect(await code({ ...base, token_endpoint_auth_method: "client_secret_basic" })).toBe(
            "invalid_client_metadata",
        );
        expect(await code({ ...base, grant_types: ["password"] })).toBe("invalid_client_metadata");
        expect(await code({ ...base, response_types: ["token"] })).toBe("invalid_client_metadata");
        expect(
            await code({
                ...base,
                token_endpoint_auth_method: "none",
                grant_types: ["refresh_token"],
                response_types: ["code"],
            }),
        ).toBeNull();
    });

    it("prunes unused old clients at most once per 10 minutes", async () => {
        const now = Date.now();
        const spy = jest.spyOn(Date, "now").mockReturnValue(now);
        await service.register({ redirect_uris: ["https://a.com/cb"] });
        await service.register({ redirect_uris: ["https://a.com/cb"] });
        expect(deleteMany).toHaveBeenCalledTimes(1);
        expect(deleteMany).toHaveBeenCalledWith({
            where: {
                createdAt: { lt: new Date(now - UNUSED_CLIENT_PRUNE_DAYS * 86_400_000) },
                grants: { none: {} },
            },
        });
        spy.mockReturnValue(now + 11 * 60 * 1000);
        await service.register({ redirect_uris: ["https://a.com/cb"] });
        expect(deleteMany).toHaveBeenCalledTimes(2);
    });

    it("finds by client id", async () => {
        findUnique.mockResolvedValue({ clientId: "mcp_x" });
        expect(await service.findByClientId("mcp_x")).toEqual({ clientId: "mcp_x" });
        expect(findUnique).toHaveBeenCalledWith({ where: { clientId: "mcp_x" } });
    });
});
