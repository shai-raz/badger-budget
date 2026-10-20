import type { McpAuthContext } from "../../oauth/oauth-tokens.service";
import { McpAuthenticateGuard } from "./mcp-authenticate.guard";
import type { McpRequest } from "./mcp-request.types";
import { httpContext } from "./test-helpers";

const CONTEXT: McpAuthContext = {
    grantId: "grant-1",
    userId: "user-1",
    clientId: "client-1",
    scopes: ["read"],
    expiresAt: new Date("2026-10-05T12:00:00.500Z"),
    resource: "https://api.example.com/api/v1/mcp",
};

describe("McpAuthenticateGuard", () => {
    const validate = jest.fn();
    const guard = new McpAuthenticateGuard({ validateAccessToken: validate } as never);

    async function run(authorization?: string) {
        const req = { headers: authorization === undefined ? {} : { authorization } } as McpRequest;
        await expect(guard.canActivate(httpContext(req))).resolves.toBe(true);
        return req;
    }

    beforeEach(() => validate.mockReset());

    it("flags a missing header without validating", async () => {
        const req = await run();
        expect(req.mcpAuthError).toBe("missing");
        expect(req.mcpAuth).toBeUndefined();
        expect(validate).not.toHaveBeenCalled();
    });

    it("ignores non-bearer schemes", async () => {
        const req = await run("Basic x");
        expect(req.mcpAuthError).toBe("missing");
        expect(validate).not.toHaveBeenCalled();
    });

    it("flags an invalid token", async () => {
        validate.mockResolvedValue(null);
        const req = await run("Bearer bdg_at_nope");
        expect(validate).toHaveBeenCalledWith("bdg_at_nope");
        expect(req.mcpAuthError).toBe("invalid_token");
        expect(req.auth).toBeUndefined();
    });

    it("sets auth and mcpAuth for a valid token (case-insensitive scheme)", async () => {
        validate.mockResolvedValue(CONTEXT);
        const req = await run("bearer bdg_at_ok");
        expect(req.mcpAuthError).toBeUndefined();
        expect(req.mcpAuth).toBe(CONTEXT);
        expect(req.auth).toEqual({
            token: "bdg_at_ok",
            clientId: "client-1",
            scopes: ["read"],
            expiresAt: Math.floor(CONTEXT.expiresAt.getTime() / 1000),
            resource: new URL(CONTEXT.resource),
            extra: { userId: "user-1", grantId: "grant-1" },
        });
    });

    it("treats a web JWT as an invalid token (validateAccessToken rejects non-bdg_at_ tokens)", async () => {
        validate.mockResolvedValue(null);
        const req = await run("Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.sig");
        expect(req.mcpAuthError).toBe("invalid_token");
        expect(req.mcpAuth).toBeUndefined();
    });
});
