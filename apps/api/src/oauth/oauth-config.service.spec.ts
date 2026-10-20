import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { OAuthConfigService } from "./oauth-config.service";

describe("OAuthConfigService", () => {
    const original = { ...process.env };
    beforeEach(() => {
        delete process.env.API_PUBLIC_URL;
        delete process.env.WEB_APP_URL;
        delete process.env.PUBLIC_URL;
        delete process.env.WEB_DIST_DIR;
        delete process.env.PORT;
    });
    afterEach(() => {
        process.env = { ...original };
    });

    it("uses API_PUBLIC_URL without a trailing slash", () => {
        process.env.API_PUBLIC_URL = "https://api.example.com/";
        process.env.WEB_APP_URL = "https://app.example.com";
        const c = new OAuthConfigService();
        expect(c.apiPublicUrl).toBe("https://api.example.com");
        expect(c.issuer).toBe("https://api.example.com");
        expect(c.mcpResourceUrl).toBe("https://api.example.com/api/v1/mcp");
        expect(c.protectedResourceMetadataUrl).toBe(
            "https://api.example.com/.well-known/oauth-protected-resource/api/v1/mcp",
        );
        expect(c.authorizationEndpoint).toBe("https://api.example.com/api/v1/oauth/authorize");
        expect(c.tokenEndpoint).toBe("https://api.example.com/api/v1/oauth/token");
        expect(c.registrationEndpoint).toBe("https://api.example.com/api/v1/oauth/register");
        expect(c.revocationEndpoint).toBe("https://api.example.com/api/v1/oauth/revoke");
        expect(c.webAppUrl).toBe("https://app.example.com");
        expect(c.consentUrl("a b/c")).toBe("https://app.example.com/oauth/consent?request=a%20b%2Fc");
    });

    it("uses PUBLIC_URL for both the API and the web app", () => {
        process.env.PUBLIC_URL = "https://budget.example.com/";
        const c = new OAuthConfigService();
        expect(c.apiPublicUrl).toBe("https://budget.example.com");
        expect(c.webAppUrl).toBe("https://budget.example.com");
    });

    it("lets API_PUBLIC_URL and WEB_APP_URL override PUBLIC_URL", () => {
        process.env.PUBLIC_URL = "https://budget.example.com";
        process.env.API_PUBLIC_URL = "https://api.example.com";
        process.env.WEB_APP_URL = "https://app.example.com";
        const c = new OAuthConfigService();
        expect(c.apiPublicUrl).toBe("https://api.example.com");
        expect(c.webAppUrl).toBe("https://app.example.com");
    });

    it("serves the web app from the API origin when the SPA is bundled", () => {
        const dist = mkdtempSync(join(tmpdir(), "oauth-config-"));
        try {
            writeFileSync(join(dist, "index.html"), "<html></html>");
            process.env.WEB_DIST_DIR = dist;
            process.env.API_PUBLIC_URL = "https://api.example.com";
            expect(new OAuthConfigService().webAppUrl).toBe("https://api.example.com");
        } finally {
            rmSync(dist, { recursive: true, force: true });
        }
    });

    it("falls back to localhost defaults", () => {
        expect(new OAuthConfigService().apiPublicUrl).toBe("http://localhost:3000");
        process.env.PORT = "4000";
        const c = new OAuthConfigService();
        expect(c.apiPublicUrl).toBe("http://localhost:4000");
        expect(c.webAppUrl).toBe("http://localhost:3001");
    });
});
