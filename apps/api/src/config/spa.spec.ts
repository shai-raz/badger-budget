import { mkdtempSync, rmSync, writeFileSync } from "fs";
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
