import { Injectable } from "@nestjs/common";
import { z } from "zod";
import { BudgetsService } from "../../budgets/budgets.service";
import { round2, toColumnar, toIsoDate } from "./columnar";
import type { McpToolDefinition } from "./tool.types";

const inputSchema = z
    .object({
        budgetId: z.string().uuid().optional().describe("Return only this budget. Omit to return all budgets."),
        period: z
            .enum(["daily", "weekly", "monthly", "yearly"])
            .optional()
            .describe("When no budgetId is given, only include budgets with this period."),
        periodOffset: z
            .number()
            .int()
            .min(-120)
            .max(12)
            .default(0)
            .describe("Shift the viewed period: 0 is the current period, -1 the previous one."),
    })
    .strict();

const COLUMNS = [
    "budgetId",
    "name",
    "period",
    "periodStart",
    "periodEnd",
    "amount",
    "currency",
    "spent",
    "remaining",
    "percentageUsed",
    "transactionCount",
    "isOverBudget",
    "existsInPeriod",
    "categories",
    "accountName",
] as const;

interface BudgetAnalyticsLike {
    budgetId: string;
    budgetName: string;
    period: string;
    periodStart: Date;
    periodEnd: Date;
    amount: number;
    currencyDisplay?: { code: string } | null;
    totalSpent: number;
    remaining: number;
    percentageUsed: number;
    transactionCount: number;
    isOverBudget: boolean;
    existsInPeriod: boolean;
    categories?: Array<{ name: string }>;
    account?: { name: string } | null;
}

@Injectable()
export class GetBudgetStatusTool implements McpToolDefinition<typeof inputSchema> {
    readonly name = "get_budget_status";
    readonly title = "Get budget status";
    readonly description =
        "Status of the user's budgets for a period, as columnar rows: budget amount, amount spent, remaining and percentage used. " +
        "Spending counts expense transactions in the budget's categories, excluding hidden ones, converted to the budget currency " +
        "(a transaction with no available conversion counts as 0). Spending is net of linked reimbursements " +
        "(income the user linked to an expense reduces that expense). Period windows are UTC. " +
        "`existsInPeriod` is false when the viewed period falls outside the budget's start/end dates. " +
        "`categories` lists the names of the budget's categories; `accountName` is null when the budget is not tied to an account.";
    readonly inputSchema = inputSchema;

    constructor(private readonly budgets: BudgetsService) {}

    async execute(userId: string, input: z.infer<typeof inputSchema>): Promise<unknown> {
        const periodOffset = input.periodOffset ?? 0;
        let items: BudgetAnalyticsLike[];
        if (input.budgetId) {
            const one = await this.budgets.getAnalytics(input.budgetId, userId, { periodOffset });
            items = [one as unknown as BudgetAnalyticsLike];
        } else {
            const dash = await this.budgets.getDashboard(userId, { period: input.period, periodOffset });
            items = dash.budgets as unknown as BudgetAnalyticsLike[];
        }

        return toColumnar(
            COLUMNS,
            items.map((b) => ({
                budgetId: b.budgetId,
                name: b.budgetName,
                period: b.period,
                periodStart: toIsoDate(b.periodStart),
                periodEnd: toIsoDate(b.periodEnd),
                amount: round2(b.amount),
                currency: b.currencyDisplay?.code ?? null,
                spent: round2(b.totalSpent),
                remaining: round2(b.remaining),
                percentageUsed: b.percentageUsed,
                transactionCount: b.transactionCount,
                isOverBudget: b.isOverBudget,
                existsInPeriod: b.existsInPeriod,
                categories: (b.categories ?? []).map((c) => c.name),
                accountName: b.account?.name ?? null,
            })),
        );
    }
}
