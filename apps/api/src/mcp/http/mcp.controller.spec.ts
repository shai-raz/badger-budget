import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AccountsService } from "../../accounts/accounts.service";
import { configureApp } from "../../app.setup";
import { BudgetsService } from "../../budgets/budgets.service";
import { CategoriesService } from "../../categories/categories.service";
import { OAuthTokensService } from "../../oauth/oauth-tokens.service";
import { PrismaModule } from "../../prisma/prisma.module";
import { PrismaService } from "../../prisma/prisma.service";
import { ReportsService } from "../../reports/reports.service";
import { AttachmentStorageService } from "../../transactions/attachments/attachment-storage.service";
import { TransactionsService } from "../../transactions/transactions.service";
import { McpModule } from "../mcp.module";

const MCP_URL = "/api/v1/mcp";
const HEADERS = {
    Accept: "application/json, text/event-stream",
    "Content-Type": "application/json",
    "MCP-Protocol-Version": "2025-06-18",
};

function authContext(userId: string, grantId: string) {
    return {
        grantId,
        userId,
        clientId: "mcp_test",
        scopes: ["read"],
        expiresAt: new Date(Date.now() + 3600_000),
        resource: "https://api.test/api/v1/mcp",
    };
}

describe("McpController (http)", () => {
    const originalEnv = { ...process.env };
    let app: NestExpressApplication;
    let accounts: { findAll: jest.Mock };

    beforeEach(async () => {
        process.env.API_PUBLIC_URL = "https://api.test";
        process.env.WEB_APP_URL = "https://web.test";
        delete process.env.TRUST_PROXY_HOPS;

        accounts = {
            findAll: jest.fn(async (userId: string) => [
                {
                    id: `acc-${userId}`,
                    name: `Account of ${userId}`,
                    type: "bank",
                    currency: { code: "ILS" },
                    balance: 10,
                    balanceKind: "account_balance",
                    balanceDate: null,
                    cardFrame: null,
                    cardIssuer: null,
                    accountNumber: null,
                },
            ]),
        };
        const fakeTokens = {
            validateAccessToken: jest.fn(async (raw: string) => {
                if (raw === "bdg_at_userA") return authContext("user-A", "grant-A");
                if (raw === "bdg_at_userA2") return authContext("user-A", "grant-A2");
                if (raw === "bdg_at_userB") return authContext("user-B", "grant-B");
                return null;
            }),
        };

        const moduleRef = await Test.createTestingModule({ imports: [PrismaModule, McpModule] })
            .overrideProvider(PrismaService)
            .useValue({})
            // TransactionsModule now imports AttachmentStorageModule, which needs ConfigService; this spec has no ConfigModule.
            .overrideProvider(AttachmentStorageService)
            .useValue({ enabled: false })
            .overrideProvider(OAuthTokensService)
            .useValue(fakeTokens)
            .overrideProvider(AccountsService)
            .useValue(accounts)
            .overrideProvider(CategoriesService)
            .useValue({ findAll: jest.fn().mockResolvedValue([]) })
            .overrideProvider(TransactionsService)
            .useValue({})
            .overrideProvider(BudgetsService)
            .useValue({ findAll: jest.fn().mockResolvedValue([]) })
            .overrideProvider(ReportsService)
            .useValue({})
            .compile();

        app = moduleRef.createNestApplication<NestExpressApplication>();
        configureApp(app);
        await app.init();
    });

    afterEach(async () => {
        await app?.close();
        process.env = { ...originalEnv };
    });

    const post = (token: string | null, body: unknown) => {
        const req = request(app.getHttpServer()).post(MCP_URL).set(HEADERS);
        if (token) req.set("Authorization", `Bearer ${token}`);
        return req.send(body as object);
    };
    const rpc = (method: string, params?: unknown, id = 1) => ({ jsonrpc: "2.0", id, method, params });

    describe("authentication", () => {
        it("401 with a resource_metadata challenge when no token is sent (AC1)", async () => {
            const res = await post(null, rpc("tools/list")).expect(401);
            const challenge = res.headers["www-authenticate"];
            expect(challenge).toContain(
                'resource_metadata="https://api.test/.well-known/oauth-protected-resource/api/v1/mcp"',
            );
            expect(challenge).toContain('scope="read"');
        });

        it("serves the protected-resource metadata at the host root (AC1)", async () => {
            const res = await request(app.getHttpServer())
                .get("/.well-known/oauth-protected-resource/api/v1/mcp")
                .expect(200);
            expect(res.body.resource).toBe("https://api.test/api/v1/mcp");
            expect(res.body.authorization_servers).toEqual(["https://api.test"]);
        });

        it("401 invalid_token for an unknown token", async () => {
            const res = await post("bdg_at_nope", rpc("tools/list")).expect(401);
            expect(res.headers["www-authenticate"]).toContain('error="invalid_token"');
        });

        it("exposes WWW-Authenticate through CORS", async () => {
            const res = await post(null, rpc("tools/list")).set("Origin", "http://localhost:3001").expect(401);
            expect(res.headers["access-control-expose-headers"]).toContain("WWW-Authenticate");
        });
    });

    describe("origin", () => {
        it("403 for a foreign Origin", async () => {
            await post("bdg_at_userA", rpc("tools/list")).set("Origin", "https://evil.example").expect(403);
        });

        it("allows requests without an Origin", async () => {
            await post("bdg_at_userA", rpc("tools/list")).expect(200);
        });
    });

    describe("method handling", () => {
        it.each(["get", "delete"] as const)("405 with Allow: POST for %s", async (method) => {
            const res = await request(app.getHttpServer())
                [method](MCP_URL)
                .set("Authorization", "Bearer bdg_at_userA")
                .expect(405);
            expect(res.headers.allow).toBe("POST");
            expect(res.body.error.code).toBe(-32000);
        });
    });

    describe("tools", () => {
        it("tools/list returns the five read-only tools", async () => {
            const res = await post("bdg_at_userA", rpc("tools/list")).expect(200);
            const tools = res.body.result.tools as { name: string; annotations: { readOnlyHint: boolean } }[];
            expect(tools.map((t) => t.name).sort()).toEqual([
                "get_budget_status",
                "get_spending_report",
                "list_accounts",
                "list_categories",
                "search_transactions",
            ]);
            for (const t of tools) expect(t.annotations.readOnlyHint).toBe(true);
        });

        it("list_accounts is scoped to the token user (AC10)", async () => {
            const call = rpc("tools/call", { name: "list_accounts", arguments: {} });

            const a = await post("bdg_at_userA", call).expect(200);
            expect(accounts.findAll).toHaveBeenLastCalledWith("user-A");
            expect(a.body.result.isError).toBeFalsy();
            expect(a.body.result.content[0].text).toContain("acc-user-A");
            expect(a.body.result.content[0].text).not.toContain("user-B");

            const b = await post("bdg_at_userB", call).expect(200);
            expect(accounts.findAll).toHaveBeenLastCalledWith("user-B");
            expect(b.body.result.content[0].text).toContain("acc-user-B");
            expect(b.body.result.content[0].text).not.toContain("user-A");
        });

        it("returns isError with HTTP 200 for invalid tool arguments", async () => {
            const res = await post(
                "bdg_at_userA",
                rpc("tools/call", { name: "search_transactions", arguments: { startDate: "not-a-date" } }),
            ).expect(200);
            expect(res.body.result.isError).toBe(true);
        });
    });

    describe("batching", () => {
        it("rejects JSON-RPC batch arrays with -32600", async () => {
            const res = await post("bdg_at_userA", [
                rpc("tools/list", undefined, 1),
                rpc("tools/list", undefined, 2),
            ]).expect(400);
            expect(res.body.error.code).toBe(-32600);
            expect(accounts.findAll).not.toHaveBeenCalled();
        });
    });

    describe("throttling", () => {
        it("429s the 121st request of a user, across grants, without affecting other users (AC13)", async () => {
            const body = rpc("tools/list");
            for (let i = 0; i < 120; i++) {
                await post(i % 2 ? "bdg_at_userA2" : "bdg_at_userA", body).expect(200);
            }
            await post("bdg_at_userA", body).expect(429);
            await post("bdg_at_userA2", body).expect(429);
            await post("bdg_at_userB", body).expect(200);
        });
    });
});
