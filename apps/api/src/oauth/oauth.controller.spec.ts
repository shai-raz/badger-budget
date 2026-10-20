import { CanActivate, ExecutionContext, UnauthorizedException } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import { ThrottlerModule } from "@nestjs/throttler";
import request from "supertest";
import { configureApp } from "../app.setup";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { PrismaService } from "../prisma/prisma.service";
import { OAuthAuthorizationService } from "./oauth-authorization.service";
import { OAuthClientsService } from "./oauth-clients.service";
import { OAuthConfigService } from "./oauth-config.service";
import { OAuthConnectionsController } from "./oauth-connections.controller";
import { OAuthMetadataController } from "./oauth-metadata.controller";
import { OAuthTokensService } from "./oauth-tokens.service";
import { OAuthController } from "./oauth.controller";

const CLAUDE_URI = "https://claude.ai/api/mcp/auth_callback";
const CHALLENGE = "a".repeat(43);
const UUID = "0b9d1c1e-7f4a-4a52-9d65-3f1d3a5b7c11";

describe("OAuth controllers (http)", () => {
    const originalEnv = { ...process.env };
    let app: NestExpressApplication;
    let fakeUser: { id: string } | null;
    let prisma: { oAuthClient: Record<string, jest.Mock>; oAuthAuthorizationRequest: Record<string, jest.Mock> };
    let tokens: Record<string, jest.Mock>;
    let authorization: Record<string, jest.Mock>;

    const fakeJwtGuard: CanActivate = {
        canActivate(ctx: ExecutionContext) {
            if (!fakeUser) throw new UnauthorizedException();
            ctx.switchToHttp().getRequest().user = fakeUser;
            return true;
        },
    };

    async function build({
        realAuthorization = false,
        trustProxyHops,
    }: { realAuthorization?: boolean; trustProxyHops?: string } = {}) {
        process.env.API_PUBLIC_URL = "https://api.test";
        process.env.WEB_APP_URL = "https://web.test";
        if (trustProxyHops === undefined) delete process.env.TRUST_PROXY_HOPS;
        else process.env.TRUST_PROXY_HOPS = trustProxyHops;

        const authProvider = realAuthorization
            ? OAuthAuthorizationService
            : { provide: OAuthAuthorizationService, useValue: authorization };

        const moduleRef = await Test.createTestingModule({
            imports: [ThrottlerModule.forRoot([{ ttl: 60000, limit: 10 }])],
            controllers: [OAuthMetadataController, OAuthController, OAuthConnectionsController],
            providers: [
                OAuthConfigService,
                OAuthClientsService,
                authProvider,
                { provide: OAuthTokensService, useValue: tokens },
                { provide: PrismaService, useValue: prisma },
            ],
        })
            .overrideGuard(JwtAuthGuard)
            .useValue(fakeJwtGuard)
            .compile();

        app = moduleRef.createNestApplication<NestExpressApplication>();
        configureApp(app);
        await app.init();
    }

    beforeEach(() => {
        fakeUser = { id: "user-1" };
        prisma = {
            oAuthClient: {
                create: jest
                    .fn()
                    .mockImplementation(({ data }) =>
                        Promise.resolve({ ...data, createdAt: new Date("2026-01-01T00:00:00Z") }),
                    ),
                deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
                findUnique: jest.fn().mockResolvedValue({
                    id: "client-row",
                    clientId: "mcp_x",
                    clientName: "Test",
                    redirectUris: [CLAUDE_URI],
                }),
            },
            oAuthAuthorizationRequest: { create: jest.fn().mockResolvedValue({}) },
        };
        tokens = {
            exchangeCode: jest.fn(),
            refresh: jest.fn(),
            revoke: jest.fn().mockResolvedValue(undefined),
            listConnections: jest.fn().mockResolvedValue([]),
            revokeConnection: jest.fn().mockResolvedValue(undefined),
        };
        authorization = {
            startAuthorization: jest.fn(),
            getConsentRequest: jest.fn().mockResolvedValue({ clientName: "Test" }),
            decide: jest.fn().mockResolvedValue({ redirectUrl: "https://claude.ai/x" }),
        };
    });

    afterEach(async () => {
        await app?.close();
        process.env = { ...originalEnv };
    });

    describe("metadata", () => {
        it("serves the AS metadata at the host root", async () => {
            await build();
            const res = await request(app.getHttpServer()).get("/.well-known/oauth-authorization-server").expect(200);
            expect(res.body).toMatchObject({
                issuer: "https://api.test",
                authorization_endpoint: "https://api.test/api/v1/oauth/authorize",
                token_endpoint: "https://api.test/api/v1/oauth/token",
                registration_endpoint: "https://api.test/api/v1/oauth/register",
                revocation_endpoint: "https://api.test/api/v1/oauth/revoke",
                response_types_supported: ["code"],
                grant_types_supported: ["authorization_code", "refresh_token"],
                code_challenge_methods_supported: ["S256"],
                token_endpoint_auth_methods_supported: ["none"],
                scopes_supported: ["read"],
                authorization_response_iss_parameter_supported: true,
            });
            expect(res.body.client_id_metadata_document_supported).toBeUndefined();
        });

        it("is not served under the global prefix", async () => {
            await build();
            await request(app.getHttpServer()).get("/api/v1/.well-known/oauth-authorization-server").expect(404);
        });
    });

    describe("register", () => {
        it("accepts unknown extra fields (the global pipe must not 400)", async () => {
            await build();
            const res = await request(app.getHttpServer())
                .post("/api/v1/oauth/register")
                .send({
                    client_name: "Claude",
                    redirect_uris: [CLAUDE_URI],
                    application_type: "web",
                    logo_uri: "https://example.com/logo.png",
                    contacts: ["a@b.c"],
                })
                .expect(201);
            expect(res.body.client_id).toEqual(expect.any(String));
            expect(res.body.redirect_uris).toEqual([CLAUDE_URI]);
        });

        it("returns an RFC 7591 error for bad redirect_uris", async () => {
            await build();
            const res = await request(app.getHttpServer())
                .post("/api/v1/oauth/register")
                .send({ redirect_uris: ["http://evil.example.com/cb"] })
                .expect(400);
            expect(res.body.error).toBe("invalid_redirect_uri");
            expect(res.headers["cache-control"]).toBe("no-store");
        });
    });

    describe("authorize", () => {
        const query = (over: Record<string, string> = {}) => ({
            response_type: "code",
            client_id: "mcp_x",
            redirect_uri: CLAUDE_URI,
            code_challenge: CHALLENGE,
            code_challenge_method: "S256",
            state: "st-1",
            ...over,
        });

        it("returns 400 JSON and no Location for a mismatched redirect_uri", async () => {
            await build({ realAuthorization: true });
            const res = await request(app.getHttpServer())
                .get("/api/v1/oauth/authorize")
                .query(query({ redirect_uri: "https://claude.ai/other" }))
                .expect(400);
            expect(res.headers.location).toBeUndefined();
            expect(res.body.error).toBe("invalid_request");
        });

        it("redirects a valid request to the web consent page", async () => {
            await build({ realAuthorization: true });
            const res = await request(app.getHttpServer()).get("/api/v1/oauth/authorize").query(query()).expect(302);
            expect(res.headers.location).toMatch(/^https:\/\/web\.test\/oauth\/consent\?request=/);
            expect(prisma.oAuthAuthorizationRequest.create).toHaveBeenCalledTimes(1);
        });

        it("redirects protocol errors to the client redirect_uri", async () => {
            await build({ realAuthorization: true });
            const res = await request(app.getHttpServer())
                .get("/api/v1/oauth/authorize")
                .query(query({ code_challenge_method: "plain" }))
                .expect(302);
            const location = new URL(res.headers.location);
            expect(`${location.origin}${location.pathname}`).toBe(CLAUDE_URI);
            expect(location.searchParams.get("error")).toBe("invalid_request");
            expect(location.searchParams.get("state")).toBe("st-1");
        });
    });

    describe("token", () => {
        it("rejects an unknown grant_type (form encoded) with no-store", async () => {
            await build();
            const res = await request(app.getHttpServer())
                .post("/api/v1/oauth/token")
                .type("form")
                .send({ grant_type: "password" })
                .expect(400);
            expect(res.body).toMatchObject({ error: "unsupported_grant_type" });
            expect(res.headers["cache-control"]).toBe("no-store");
            expect(res.headers.pragma).toBe("no-cache");
        });

        it("returns tokens without internal ids on a successful code exchange", async () => {
            tokens.exchangeCode.mockResolvedValue({
                access_token: "at",
                token_type: "Bearer",
                expires_in: 3600,
                refresh_token: "rt",
                scope: "read",
                refreshTokenId: "internal",
            });
            await build();
            const res = await request(app.getHttpServer())
                .post("/api/v1/oauth/token")
                .type("form")
                .send({ grant_type: "authorization_code", code: "c" })
                .expect(200);
            expect(res.body.access_token).toBe("at");
            expect(res.body.refreshTokenId).toBeUndefined();
            expect(res.headers["cache-control"]).toBe("no-store");
            expect(tokens.exchangeCode).toHaveBeenCalledWith(expect.objectContaining({ code: "c" }));
        });

        it("dispatches refresh_token grants (JSON body)", async () => {
            tokens.refresh.mockResolvedValue({ access_token: "at2" });
            await build();
            const res = await request(app.getHttpServer())
                .post("/api/v1/oauth/token")
                .send({ grant_type: "refresh_token", refresh_token: "rt" })
                .expect(200);
            expect(res.body.access_token).toBe("at2");
        });
    });

    describe("revoke", () => {
        it("returns 200 with an empty body", async () => {
            await build();
            const res = await request(app.getHttpServer())
                .post("/api/v1/oauth/revoke")
                .type("form")
                .send({ token: "unknown" })
                .expect(200);
            expect(res.text).toBe("");
        });
    });

    describe("throttling", () => {
        const register = (agent: request.Agent | ReturnType<typeof request>, xff?: string) => {
            const req = (agent as ReturnType<typeof request>)
                .post("/api/v1/oauth/register")
                .send({ redirect_uris: [CLAUDE_URI] });
            return xff ? req.set("X-Forwarded-For", xff) : req;
        };

        it("returns 429 on the 21st register request from one IP", async () => {
            await build();
            const server = app.getHttpServer();
            for (let i = 0; i < 20; i++) {
                await register(request(server)).expect(201);
            }
            await register(request(server)).expect(429);
        });

        it("keys buckets on the forwarded client IP when TRUST_PROXY_HOPS=1", async () => {
            await build({ trustProxyHops: "1" });
            const server = app.getHttpServer();
            for (let i = 0; i < 20; i++) {
                await register(request(server), "1.1.1.1").expect(201);
            }
            await register(request(server), "1.1.1.1").expect(429);
            await register(request(server), "2.2.2.2").expect(201);
        });

        it("throttles GET requests/:id at 30/min (guard counted once)", async () => {
            await build();
            const server = app.getHttpServer();
            for (let i = 0; i < 30; i++) {
                await request(server).get("/api/v1/oauth/requests/abc").expect(200);
            }
            await request(server).get("/api/v1/oauth/requests/abc").expect(429);
        });

        it("throttles POST requests/:id/decision at 30/min (guard counted once)", async () => {
            await build();
            const server = app.getHttpServer();
            for (let i = 0; i < 30; i++) {
                await request(server).post("/api/v1/oauth/requests/abc/decision").send({ approve: true }).expect(200);
            }
            await request(server).post("/api/v1/oauth/requests/abc/decision").send({ approve: true }).expect(429);
        });
    });

    describe("consent endpoints", () => {
        it("requires the JWT for the decision endpoint", async () => {
            fakeUser = null;
            await build();
            await request(app.getHttpServer())
                .post("/api/v1/oauth/requests/abc/decision")
                .send({ approve: true })
                .expect(401);
        });

        it("validates approve as a boolean", async () => {
            await build();
            await request(app.getHttpServer())
                .post("/api/v1/oauth/requests/abc/decision")
                .send({ approve: "yes" })
                .expect(400);
            expect(authorization.decide).not.toHaveBeenCalled();
        });

        it("passes the user and decision to the service", async () => {
            await build();
            await request(app.getHttpServer())
                .post("/api/v1/oauth/requests/abc/decision")
                .send({ approve: false })
                .expect(200);
            expect(authorization.decide).toHaveBeenCalledWith("abc", "user-1", false);
        });

        it("returns the consent request for the signed-in user", async () => {
            await build();
            const res = await request(app.getHttpServer()).get("/api/v1/oauth/requests/abc").expect(200);
            expect(res.body).toEqual({ clientName: "Test" });
            expect(authorization.getConsentRequest).toHaveBeenCalledWith("abc", "user-1");
        });
    });

    describe("connections", () => {
        it("lists connections", async () => {
            tokens.listConnections.mockResolvedValue([{ id: UUID }]);
            await build();
            const res = await request(app.getHttpServer()).get("/api/v1/oauth/connections").expect(200);
            expect(res.body).toEqual([{ id: UUID }]);
            expect(tokens.listConnections).toHaveBeenCalledWith("user-1");
        });

        it("rejects a non-uuid id", async () => {
            await build();
            await request(app.getHttpServer()).delete("/api/v1/oauth/connections/not-a-uuid").expect(400);
        });

        it("revokes a connection with 204", async () => {
            await build();
            await request(app.getHttpServer()).delete(`/api/v1/oauth/connections/${UUID}`).expect(204);
            expect(tokens.revokeConnection).toHaveBeenCalledWith("user-1", UUID);
        });

        it("exposes the MCP server url", async () => {
            await build();
            const res = await request(app.getHttpServer()).get("/api/v1/oauth/mcp-config").expect(200);
            expect(res.body).toEqual({ mcpServerUrl: "https://api.test/api/v1/mcp" });
        });
    });
});
