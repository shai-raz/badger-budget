import { DCR_MAX_URI_LENGTH } from "./oauth.constants";
import {
    isAllowedRedirectUri,
    isLoopbackRedirect,
    isVerifiedClaudeRedirect,
    redirectDisplay,
    redirectUriMatches,
} from "./redirect-uri";

describe("redirect-uri", () => {
    it.each([
        "https://example.com/cb",
        "http://localhost:1234/cb",
        "http://127.0.0.1/cb",
        "http://[::1]:5/cb",
        "cursor://anysphere.cursor-mcp/oauth/callback",
    ])("allows %s", (u) => expect(isAllowedRedirectUri(u)).toBe(true));

    it.each([
        "http://example.com/cb",
        "javascript:alert(1)",
        "data:text/html,hi",
        "https://example.com/cb#frag",
        "https://user:pw@example.com/cb",
        "https://example.com/" + "a".repeat(DCR_MAX_URI_LENGTH),
        "vscode://x",
        "file:///etc/passwd",
        "not a url",
    ])("rejects %s", (u) => expect(isAllowedRedirectUri(u)).toBe(false));

    it("detects loopback", () => {
        expect(isLoopbackRedirect("http://127.0.0.1:9/x")).toBe(true);
        expect(isLoopbackRedirect("https://localhost/x")).toBe(false);
    });

    describe("redirectUriMatches", () => {
        it("ignores the port on loopback", () => {
            expect(redirectUriMatches("http://localhost:1111/cb", "http://localhost:2222/cb")).toBe(true);
            expect(redirectUriMatches("http://127.0.0.1/cb", "http://127.0.0.1:8080/cb")).toBe(true);
            expect(redirectUriMatches("http://[::1]:1/cb", "http://[::1]:2/cb")).toBe(true);
        });
        it("requires loopback path, query and host to match", () => {
            expect(redirectUriMatches("http://localhost:1/cb", "http://localhost:1/other")).toBe(false);
            expect(redirectUriMatches("http://localhost:1/cb?a=1", "http://localhost:1/cb?a=2")).toBe(false);
            expect(redirectUriMatches("http://localhost:1/cb", "http://127.0.0.1:1/cb")).toBe(false);
        });
        it("is exact for https", () => {
            const r = "https://example.com/cb";
            expect(redirectUriMatches(r, r)).toBe(true);
            expect(redirectUriMatches(r, "https://example.com:444/cb")).toBe(false);
            expect(redirectUriMatches(r, "https://example.com/cb2")).toBe(false);
            expect(redirectUriMatches(r, "https://example.com/cb/")).toBe(false);
        });
        it("is exact for cursor", () => {
            const r = "cursor://anysphere.cursor-mcp/oauth/callback";
            expect(redirectUriMatches(r, r)).toBe(true);
            expect(redirectUriMatches(r, r + "/x")).toBe(false);
        });
    });

    it("identifies verified Claude redirects", () => {
        expect(isVerifiedClaudeRedirect("https://claude.ai/api/mcp/auth_callback")).toBe(true);
        expect(isVerifiedClaudeRedirect("https://claude.com/api/mcp/auth_callback")).toBe(true);
        expect(isVerifiedClaudeRedirect("https://claude.ai/api/mcp/auth_callback/")).toBe(false);
        expect(isVerifiedClaudeRedirect("https://evil.com/api/mcp/auth_callback")).toBe(false);
    });

    it("builds display strings", () => {
        expect(redirectDisplay("https://example.com:8443/cb")).toBe("example.com:8443");
        expect(redirectDisplay("cursor://anysphere.cursor-mcp/oauth/callback")).toBe("cursor://anysphere.cursor-mcp");
    });
});
