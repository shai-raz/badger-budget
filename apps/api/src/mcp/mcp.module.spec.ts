import { Test } from "@nestjs/testing";
import { z } from "zod";
import { PrismaModule } from "../prisma/prisma.module";
import { PrismaService } from "../prisma/prisma.service";
import { McpModule } from "./mcp.module";
import { ToolRegistry } from "./tools/tool-registry";

describe("McpModule", () => {
    it("wires the registry with the five read-only tools", async () => {
        const moduleRef = await Test.createTestingModule({ imports: [PrismaModule, McpModule] })
            .overrideProvider(PrismaService)
            .useValue({})
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
