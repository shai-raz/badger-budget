import { McpAuthExceptionFilter } from "./mcp-auth.exception-filter";
import { McpInsufficientScopeException, McpUnauthorizedException } from "./mcp-auth.exceptions";
import { httpContext } from "./test-helpers";

const METADATA_URL = "https://api.example.com/.well-known/oauth-protected-resource/api/v1/mcp";

describe("McpAuthExceptionFilter", () => {
    const filter = new McpAuthExceptionFilter({ protectedResourceMetadataUrl: METADATA_URL } as never);

    function run(exception: McpUnauthorizedException | McpInsufficientScopeException) {
        const res = { status: jest.fn(), set: jest.fn(), json: jest.fn() };
        res.status.mockReturnValue(res);
        res.set.mockReturnValue(res);
        filter.catch(exception, httpContext({}, res));
        return res;
    }

    it("401 for a missing token advertises resource metadata and scope only", () => {
        const res = run(new McpUnauthorizedException("missing"));
        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.set).toHaveBeenCalledWith(
            "WWW-Authenticate",
            `Bearer resource_metadata="${METADATA_URL}", scope="read"`,
        );
        expect(res.json).toHaveBeenCalledWith({ error: "unauthorized", error_description: "Authentication required" });
    });

    it("401 for an invalid token adds the error", () => {
        const res = run(new McpUnauthorizedException("invalid_token"));
        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.set).toHaveBeenCalledWith(
            "WWW-Authenticate",
            `Bearer resource_metadata="${METADATA_URL}", scope="read", error="invalid_token", error_description="The access token is invalid or expired"`,
        );
        expect(res.json).toHaveBeenCalledWith({
            error: "invalid_token",
            error_description: "The access token is invalid or expired",
        });
    });

    it("403 for insufficient scope", () => {
        const res = run(new McpInsufficientScopeException());
        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.set).toHaveBeenCalledWith(
            "WWW-Authenticate",
            `Bearer resource_metadata="${METADATA_URL}", error="insufficient_scope", scope="read"`,
        );
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: "insufficient_scope" }));
    });
});
