import { Module } from "@nestjs/common";
import { ThrottlerModule } from "@nestjs/throttler";
import { AccountsModule } from "../accounts/accounts.module";
import { BudgetsModule } from "../budgets/budgets.module";
import { CategoriesModule } from "../categories/categories.module";
import { OAuthModule } from "../oauth/oauth.module";
import { ReportsModule } from "../reports/reports.module";
import { TransactionsModule } from "../transactions/transactions.module";
import { McpAuthExceptionFilter } from "./http/mcp-auth.exception-filter";
import { McpAuthenticateGuard } from "./http/mcp-authenticate.guard";
import { McpOriginGuard } from "./http/mcp-origin.guard";
import { McpRequireAuthGuard } from "./http/mcp-require-auth.guard";
import { McpThrottlerGuard } from "./http/mcp-throttler.guard";
import { McpController } from "./http/mcp.controller";
import { ProtectedResourceController } from "./http/protected-resource.controller";
import { GetBudgetStatusTool } from "./tools/get-budget-status.tool";
import { GetSpendingReportTool } from "./tools/get-spending-report.tool";
import { ListAccountsTool } from "./tools/list-accounts.tool";
import { ListCategoriesTool } from "./tools/list-categories.tool";
import { SearchTransactionsTool } from "./tools/search-transactions.tool";
import { ToolRegistry } from "./tools/tool-registry";
import { MCP_TOOLS, McpToolDefinition } from "./tools/tool.types";

const TOOL_CLASSES = [
    ListAccountsTool,
    ListCategoriesTool,
    SearchTransactionsTool,
    GetSpendingReportTool,
    GetBudgetStatusTool,
];

@Module({
    imports: [
        AccountsModule,
        CategoriesModule,
        TransactionsModule,
        BudgetsModule,
        ReportsModule,
        OAuthModule,
        // Per-user limit is applied through McpThrottlerGuard; McpController's @Throttle sets the effective 120/min.
        ThrottlerModule.forRoot([{ ttl: 60000, limit: 60 }]),
    ],
    controllers: [ProtectedResourceController, McpController],
    providers: [
        McpOriginGuard,
        McpAuthenticateGuard,
        McpThrottlerGuard,
        McpRequireAuthGuard,
        McpAuthExceptionFilter,
        ...TOOL_CLASSES,
        {
            provide: MCP_TOOLS,
            useFactory: (...tools: McpToolDefinition[]) => tools,
            inject: TOOL_CLASSES,
        },
        ToolRegistry,
    ],
    exports: [ToolRegistry],
})
export class McpModule {}
