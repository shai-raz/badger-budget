import { buildCorsOptionsDelegate, getAllowedOrigins } from "./cors";

function resolve(url: string) {
    let result: any;
    buildCorsOptionsDelegate()({ originalUrl: url }, (_err, options) => {
        result = options;
    });
    return result;
}

describe("cors", () => {
    const original = { ...process.env };
    beforeEach(() => {
        delete process.env.PUBLIC_URL;
        delete process.env.CORS_ORIGIN;
    });
    afterEach(() => {
        process.env = { ...original };
    });

    describe("buildCorsOptionsDelegate", () => {
        it.each([
            "/.well-known/oauth-authorization-server",
            "/.well-known/oauth-protected-resource/api/v1/mcp",
            "/api/v1/oauth/register",
            "/api/v1/oauth/token",
            "/api/v1/oauth/revoke",
            "/api/v1/mcp",
            "/api/v1/mcp?x=1",
        ])("returns open, non-credentialed options for %s", (url) => {
            const o = resolve(url);
            expect(o.origin).toBe(true);
            expect(o.credentials).toBe(false);
            expect(o.methods).toEqual(["GET", "POST", "OPTIONS"]);
            expect(o.exposedHeaders).toEqual(["WWW-Authenticate", "Mcp-Session-Id"]);
            expect(o.allowedHeaders).toContain("Mcp-Protocol-Version");
        });

        it.each(["/api/v1/accounts", "/api/v1/oauth/authorize", "/api/v1/oauth/connections", "/api/v1/mcp/other"])(
            "keeps the allowlisted credentialed options for %s",
            (url) => {
                const o = resolve(url);
                expect(o.credentials).toBe(true);
                expect(o.origin).toEqual(getAllowedOrigins());
                expect(o.methods).toContain("DELETE");
                expect(o.allowedHeaders).toEqual(["Content-Type", "Authorization", "Accept"]);
            },
        );
    });

    describe("getAllowedOrigins", () => {
        it("includes CORS_ORIGIN when set", () => {
            process.env.CORS_ORIGIN = "https://app.example.com";
            expect(getAllowedOrigins()).toContain("https://app.example.com");
        });

        it("includes PUBLIC_URL without a trailing slash", () => {
            process.env.PUBLIC_URL = "https://budget.example.com/";
            expect(getAllowedOrigins()).toContain("https://budget.example.com");
        });

        it("omits PUBLIC_URL and CORS_ORIGIN when unset", () => {
            expect(getAllowedOrigins()).toEqual(["http://localhost:3000", "http://localhost:3001"]);
        });
    });
});
