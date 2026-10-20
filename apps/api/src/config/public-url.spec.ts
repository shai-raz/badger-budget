import { resolvePublicUrls } from "./public-url";

describe("resolvePublicUrls", () => {
    it("defaults to localhost, with the web app on its dev port", () => {
        expect(resolvePublicUrls({}, false)).toEqual({
            apiPublicUrl: "http://localhost:3000",
            webAppUrl: "http://localhost:3001",
        });
    });

    it("uses PORT for the localhost API default", () => {
        expect(resolvePublicUrls({ PORT: "4000" }, false).apiPublicUrl).toBe("http://localhost:4000");
    });

    it("uses PUBLIC_URL for both URLs, trimmed and without trailing slashes", () => {
        expect(resolvePublicUrls({ PUBLIC_URL: "  https://budget.example.com//  " }, false)).toEqual({
            apiPublicUrl: "https://budget.example.com",
            webAppUrl: "https://budget.example.com",
        });
    });

    it("lets API_PUBLIC_URL and WEB_APP_URL override PUBLIC_URL", () => {
        expect(
            resolvePublicUrls(
                {
                    PUBLIC_URL: "https://budget.example.com",
                    API_PUBLIC_URL: "https://api.example.com/",
                    WEB_APP_URL: "https://app.example.com",
                },
                false,
            ),
        ).toEqual({ apiPublicUrl: "https://api.example.com", webAppUrl: "https://app.example.com" });
    });

    it("treats blank values as unset", () => {
        expect(resolvePublicUrls({ API_PUBLIC_URL: "   ", PUBLIC_URL: "https://budget.example.com" }, false)).toEqual({
            apiPublicUrl: "https://budget.example.com",
            webAppUrl: "https://budget.example.com",
        });
    });

    it("serves the web app from the API origin when the SPA is bundled", () => {
        expect(resolvePublicUrls({ API_PUBLIC_URL: "https://api.example.com" }, true).webAppUrl).toBe(
            "https://api.example.com",
        );
    });

    it("detects the bundled SPA from WEB_DIST_DIR by default", () => {
        const env = { WEB_DIST_DIR: "/definitely/not/a/real/dir" };
        expect(resolvePublicUrls(env).webAppUrl).toBe("http://localhost:3001");
    });
});
