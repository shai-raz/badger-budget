import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import express from "express";
import request from "supertest";
import { createSpaHandlers, isApiOrWellKnownPath, resolveWebDistDir } from "./spa";

describe("resolveWebDistDir", () => {
    let dist: string;
    beforeAll(() => {
        dist = mkdtempSync(join(tmpdir(), "spa-spec-"));
        writeFileSync(join(dist, "index.html"), "<html></html>");
    });
    afterAll(() => {
        rmSync(dist, { recursive: true, force: true });
    });

    it("is null when WEB_DIST_DIR is unset or blank", () => {
        expect(resolveWebDistDir({})).toBeNull();
        expect(resolveWebDistDir({ WEB_DIST_DIR: "   " })).toBeNull();
    });

    it("is null when the directory has no index.html", () => {
        expect(resolveWebDistDir({ WEB_DIST_DIR: tmpdir() })).toBeNull();
    });

    it("returns the trimmed directory when it holds a built app", () => {
        expect(resolveWebDistDir({ WEB_DIST_DIR: `  ${dist}  ` })).toBe(dist);
    });
});

describe("isApiOrWellKnownPath", () => {
    it.each(["/api", "/api/", "/api/v1/accounts", "/.well-known/oauth-authorization-server"])(
        "treats %s as an API path",
        (path) => {
            expect(isApiOrWellKnownPath(path)).toBe(true);
        },
    );

    it.each(["/", "/transactions", "/apiary", "/api-docs", "/_nuxt/app.js", "/well-known/x"])(
        "treats %s as an SPA path",
        (path) => {
            expect(isApiOrWellKnownPath(path)).toBe(false);
        },
    );
});

describe("createSpaHandlers cache headers", () => {
    let dist: string;
    beforeAll(() => {
        dist = mkdtempSync(join(tmpdir(), "spa-cache-spec-"));
        writeFileSync(join(dist, "index.html"), "<html></html>");
        writeFileSync(join(dist, "sw.js"), "importScripts('sw-push.js');");
        writeFileSync(join(dist, "sw-push.js"), "self.addEventListener('push', () => {});");
    });
    afterAll(() => {
        rmSync(dist, { recursive: true, force: true });
    });

    it.each(["/sw.js", "/sw-push.js"])("revalidates %s instead of caching it", async (path) => {
        const app = express();
        app.use(createSpaHandlers(dist));
        const res = await request(app).get(path).expect(200);
        expect(res.headers["cache-control"]).toBe("no-cache");
    });
});

describe("createSpaHandlers under a dot-folder", () => {
    // Express's sendFile with an absolute path applies its dotfile check to every segment, so a web dist
    // below a dot-folder (such as the .trai worktree) must still serve the SPA fallback.
    let dist: string;
    let base: string;
    beforeAll(() => {
        base = mkdtempSync(join(tmpdir(), "spa-dot-spec-"));
        dist = join(base, ".trai", "dist");
        mkdirSync(join(dist, "assets"), { recursive: true });
        writeFileSync(join(dist, "index.html"), "<html>spa</html>");
        writeFileSync(join(dist, "assets", "app.js"), "console.log('app');");
    });
    afterAll(() => {
        rmSync(base, { recursive: true, force: true });
    });

    it("serves index.html for a client route", async () => {
        const app = express();
        app.use(createSpaHandlers(dist));
        const res = await request(app).get("/transactions").expect(200);
        expect(res.text).toContain("<html>spa</html>");
    });

    it("still 404s a missing asset", async () => {
        const app = express();
        app.use(createSpaHandlers(dist));
        await request(app).get("/assets/missing.js").expect(404);
    });
});
