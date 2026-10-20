// Source-text contract for the same-origin setup (#20): the web defaults to a relative API base, `pnpm dev:web`
// proxies /api and /.well-known to the local API, and frame-blocking headers come from the API, not routeRules.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const config = readFileSync(fileURLToPath(new URL("../../nuxt.config.ts", import.meta.url)), "utf8");

describe("nuxt.config.ts same-origin contract", () => {
    it("defaults the API base URL to a relative path", () => {
        expect(config).toContain('process.env.NUXT_PUBLIC_API_BASE_URL ?? "/api/v1"');
        expect(config).not.toContain("localhost:3000/api/v1");
    });

    it("proxies /api and /.well-known to the local API in dev", () => {
        expect(config).toContain('"/api": { target: "http://localhost:3000/api", changeOrigin: true }');
        expect(config).toContain('"/.well-known": { target: "http://localhost:3000/.well-known", changeOrigin: true }');
    });

    it("leaves frame headers to the API (no routeRules)", () => {
        expect(config).not.toContain("routeRules");
        expect(config).not.toContain("X-Frame-Options");
    });

    it("keeps /.well-known out of the service worker navigation fallback", () => {
        expect(config).toContain("/^\\/\\.well-known\\//");
    });
});
