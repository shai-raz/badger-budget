import { Test } from "@nestjs/testing";
import { z } from "zod";
import { PrismaModule } from "../prisma/prisma.module";
import { PrismaService } from "../prisma/prisma.service";
import { AttachmentStorageService } from "../transactions/attachments/attachment-storage.service";
import { McpModule } from "./mcp.module";
import { ToolRegistry } from "./tools/tool-registry";

describe("McpModule", () => {
    it("wires the registry with the five read-only tools", async () => {
        const moduleRef = await Test.createTestingModule({ imports: [PrismaModule, McpModule] })
            .overrideProvider(PrismaService)
            .useValue({})
            // TransactionsModule now imports AttachmentStorageModule, which needs ConfigService; this spec has no ConfigModule.
            .overrideProvider(AttachmentStorageService)
            .useValue({ enabled: false })
            .compile();
        const registry = moduleRef.get(ToolRegistry);
        const tools = registry.list();

        expect(tools.map((t) => t.name).sort()).toEqual([
            "get_budget_status",
            "get_spending_report",
            "list_accounts",
            "list_categories",
            "search_transactions",
        ]);
        for (const t of tools) {
            expect(t.inputSchema).toBeInstanceOf(z.ZodObject);
            expect(t.description.length).toBeGreaterThan(0);
            expect(z.toJSONSchema(t.inputSchema).additionalProperties).toBe(false);
        }
    });
});
