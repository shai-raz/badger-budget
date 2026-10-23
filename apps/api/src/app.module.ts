import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ThrottlerModule } from "@nestjs/throttler";
import { PrismaModule } from "./prisma/prisma.module";
import { AuthModule } from "./auth/auth.module";
import { AccountsModule } from "./accounts/accounts.module";
import { CategoriesModule } from "./categories/categories.module";
import { BudgetsModule } from "./budgets/budgets.module";
import { TransactionsModule } from "./transactions/transactions.module";
import { CategoryMappingRulesModule } from "./category-mapping-rules/category-mapping-rules.module";
import { CardPayoffPatternsModule } from "./card-payoff-patterns/card-payoff-patterns.module";
import { ReimbursementsModule } from "./reimbursements/reimbursements.module";
import { CashWithdrawalPatternsModule } from "./cash-withdrawal-patterns/cash-withdrawal-patterns.module";
import { CurrenciesModule } from "./currencies/currencies.module";
import { GoogleSheetsModule } from "./google-sheets/google-sheets.module";
import { BankSyncModule } from "./bank-sync/bank-sync.module";
import { TransactionImportModule } from "./transactions/transaction-import.module";
import { ReportsModule } from "./reports/reports.module";
import { McpModule } from "./mcp/mcp.module";
import { OAuthModule } from "./oauth/oauth.module";
import { HealthModule } from "./health/health.module";
import { AppConfigModule } from "./app-config/app-config.module";

@Module({
    imports: [
        // Environment configuration
        ConfigModule.forRoot({
            isGlobal: true,
            envFilePath: ".env",
        }),

        // Rate limiting
        ThrottlerModule.forRoot([
            {
                ttl: 60000,
                limit: 10,
            },
        ]),

        // Database
        PrismaModule,

        // Auth
        AuthModule,

        // Feature modules
        AccountsModule,
        CategoriesModule,
        BudgetsModule,
        TransactionsModule,
        CategoryMappingRulesModule,
        CardPayoffPatternsModule,
        ReimbursementsModule,
        CashWithdrawalPatternsModule,
        CurrenciesModule,
        GoogleSheetsModule,
        BankSyncModule,
        TransactionImportModule,
        ReportsModule,
        McpModule,
        OAuthModule,

        // Public liveness/readiness (no guard)
        HealthModule,

        // Public instance config flags (no guard)
        AppConfigModule,
    ],
    controllers: [],
    providers: [],
})
export class AppModule {}
