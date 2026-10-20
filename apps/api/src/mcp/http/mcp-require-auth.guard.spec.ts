import { McpInsufficientScopeException, McpUnauthorizedException } from "./mcp-auth.exceptions";
import { McpRequireAuthGuard } from "./mcp-require-auth.guard";
import { httpContext } from "./test-helpers";

describe("McpRequireAuthGuard", () => {
    const guard = new McpRequireAuthGuard();
    const run = (req: object) => guard.canActivate(httpContext(req));

    it("passes with the read scope", () => {
        expect(run({ mcpAuth: { scopes: ["read"] } })).toBe(true);
    });

    it("throws missing when nothing was recorded", () => {
        expect(() => run({})).toThrow(McpUnauthorizedException);
        expect(() => run({})).toThrow(expect.objectContaining({ reason: "missing" }));
    });

    it("carries the recorded invalid_token reason", () => {
        expect(() => run({ mcpAuthError: "invalid_token" })).toThrow(
            expect.objectContaining({ reason: "invalid_token" }),
        );
    });

    it("throws insufficient scope without read", () => {
        expect(() => run({ mcpAuth: { scopes: ["write"] } })).toThrow(McpInsufficientScopeException);
    });
});
