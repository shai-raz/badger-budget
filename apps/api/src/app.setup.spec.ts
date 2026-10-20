import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { Controller, Get, Module, Req } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { configureApp } from "./app.setup";

@Controller(".well-known")
class WellKnownController {
    @Get("test")
    test() {
        return { ok: true };
    }
}

@Controller("accounts")
class AccountsController {
    @Get("ip")
    ip(@Req() req: { ip: string }) {
        return { ip: req.ip };
    }

    @Get()
    list() {
        return [];
    }
}

@Controller("oauth")
class OAuthController {
    @Get("token")
    token() {
        return {};
    }
}

@Module({ controllers: [WellKnownController, AccountsController, OAuthController] })
class TestModule {}

describe("configureApp", () => {
    let app: NestExpressApplication;
    const original = { ...process.env };

    beforeAll(async () => {
        process.env.TRUST_PROXY_HOPS = "1";
        delete process.env.WEB_DIST_DIR;
        const moduleRef = await Test.createTestingModule({ imports: [TestModule] }).compile();
        app = moduleRef.createNestApplication<NestExpressApplication>();
        configureApp(app);
        await app.init();
    });

    afterAll(async () => {
        process.env = { ...original };
        await app.close();
    });

    it("serves .well-known at the host root and app routes under /api/v1", async () => {
        await request(app.getHttpServer()).get("/.well-known/test").expect(200, { ok: true });
        await request(app.getHttpServer()).get("/api/v1/accounts").expect(200);
        await request(app.getHttpServer()).get("/accounts").expect(404);
    });

    it("blocks framing on every response", async () => {
        const res = await request(app.getHttpServer()).get("/api/v1/accounts");
        expect(res.headers["content-security-policy"]).toBe("frame-ancestors 'none'");
        expect(res.headers["x-frame-options"]).toBe("DENY");
    });

    it("does not serve a web app when WEB_DIST_DIR is unset", async () => {
        await request(app.getHttpServer()).get("/transactions").expect(404);
    });

    it("trusts one proxy hop for req.ip", async () => {
        const res = await request(app.getHttpServer()).get("/api/v1/accounts/ip").set("X-Forwarded-For", "1.2.3.4");
        expect(res.body.ip).toBe("1.2.3.4");
    });

    it("allows any origin, without credentials, on public OAuth paths", async () => {
        const res = await request(app.getHttpServer())
            .options("/api/v1/oauth/token")
            .set("Origin", "https://evil.example")
            .set("Access-Control-Request-Method", "POST");
        expect(res.headers["access-control-allow-origin"]).toBe("https://evil.example");
        expect(res.headers["access-control-allow-credentials"]).toBeUndefined();
    });

    it("keeps app paths restricted to the allowlist", async () => {
        const res = await request(app.getHttpServer())
            .options("/api/v1/accounts")
            .set("Origin", "https://evil.example")
            .set("Access-Control-Request-Method", "GET");
        expect(res.headers["access-control-allow-origin"]).toBeUndefined();
    });
});

describe("configureApp with a bundled web app", () => {
    let app: NestExpressApplication;
    let dist: string;
    const original = { ...process.env };

    beforeAll(async () => {
        dist = mkdtempSync(join(tmpdir(), "app-setup-spa-"));
        writeFileSync(join(dist, "index.html"), "<html>spa</html>");
        mkdirSync(join(dist, "_nuxt"));
        writeFileSync(join(dist, "_nuxt", "app.js"), "console.log('app');");
        // nuxt generate prerenders each route as a directory with its own index.html
        mkdirSync(join(dist, "transactions"));
        writeFileSync(join(dist, "transactions", "index.html"), "<html>transactions</html>");

        process.env.TRUST_PROXY_HOPS = "1";
        process.env.WEB_DIST_DIR = dist;
        const moduleRef = await Test.createTestingModule({ imports: [TestModule] }).compile();
        app = moduleRef.createNestApplication<NestExpressApplication>();
        configureApp(app);
        await app.init();
    });

    afterAll(async () => {
        process.env = { ...original };
        await app.close();
        rmSync(dist, { recursive: true, force: true });
    });

    it("serves the SPA index for client routes, with frame headers and no-cache", async () => {
        const res = await request(app.getHttpServer()).get("/transactions/abc123").expect(200);
        expect(res.headers["content-type"]).toMatch(/text\/html/);
        expect(res.text).toContain("spa");
        expect(res.headers["cache-control"]).toBe("no-cache");
        expect(res.headers["x-frame-options"]).toBe("DENY");
        expect(res.headers["content-security-policy"]).toBe("frame-ancestors 'none'");
    });

    it("serves a prerendered route directory as the SPA index, without a redirect", async () => {
        const res = await request(app.getHttpServer()).get("/transactions").expect(200);
        expect(res.headers["content-type"]).toMatch(/text\/html/);
        expect(res.headers["location"]).toBeUndefined();
    });

    it("serves hashed build assets with an immutable cache header", async () => {
        const res = await request(app.getHttpServer()).get("/_nuxt/app.js").expect(200);
        expect(res.headers["cache-control"]).toBe("public, max-age=31536000, immutable");
    });

    it("answers missing build assets with a 404, not the SPA index", async () => {
        const res = await request(app.getHttpServer()).get("/_nuxt/missing.js").expect(404);
        expect(res.headers["content-type"] ?? "").not.toMatch(/text\/html/);
    });

    it("keeps unknown API routes as JSON 404s, not the SPA", async () => {
        const res = await request(app.getHttpServer()).get("/api/v1/does-not-exist").expect(404);
        expect(res.headers["content-type"]).toMatch(/json/);
        expect(res.body.statusCode).toBe(404);
    });

    it("does not serve the SPA under /api", async () => {
        const res = await request(app.getHttpServer()).get("/api").expect(404);
        expect(res.headers["content-type"] ?? "").not.toMatch(/text\/html/);
    });

    it("keeps .well-known routes on the API", async () => {
        await request(app.getHttpServer()).get("/.well-known/test").expect(200, { ok: true });
    });

    it("does not fall back to the SPA for non-GET requests", async () => {
        const res = await request(app.getHttpServer()).post("/transactions").expect(404);
        expect(res.headers["content-type"] ?? "").not.toMatch(/text\/html/);
    });
});
