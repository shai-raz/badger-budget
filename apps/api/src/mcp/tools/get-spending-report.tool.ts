import { Injectable } from "@nestjs/common";
import { z } from "zod";
import { DEFAULT_CURRENCY_CODE } from "@badger/shared-data";
import { ReportsService } from "../../reports/reports.service";
import { toColumnar } from "./columnar";
import { dateField } from "./schema-helpers";
import type { McpToolDefinition } from "./tool.types";

const inputSchema = z
    .object({
        startDate: dateField("Inclusive period start, YYYY-MM-DD (UTC)."),
        endDate: dateField("Inclusive period end, YYYY-MM-DD (UTC). Must not be before startDate."),
        currency: z
            .string()
            .regex(/^[A-Z]{3}$/, "Expected a 3-letter uppercase currency code")
            .optional()
            .describe(`ISO 4217 display currency code, e.g. USD. Defaults to ${DEFAULT_CURRENCY_CODE}.`),
    })
    .strict()
    .superRefine((val, ctx) => {
        if (val.endDate < val.startDate) {
            ctx.addIssue({ code: "custom", path: ["endDate"], message: "endDate must not be before startDate" });
        }
    });

@Injectable()
export class GetSpendingReportTool implements McpToolDefinition<typeof inputSchema> {
    readonly name = "get_spending_report";
    readonly title = "Get spending report";
    readonly description =
        "Spending report for a date range: total, transaction count and a per-category breakdown (sorted by amount, descending). " +
        "Covers expenses only (not income, and not hidden expenses), converted to the display currency. Amounts are net of linked reimbursements " +
        "(income the user linked to an expense reduces that expense). `comparison` is the preceding period: the same number of calendar months when the window starts on the 1st (ending on the same day of the month when it ends mid-month), otherwise the same number of days. " +
        "It also gives `changePercentage` (null when the previous total is 0) and `direction` (up, down or flat). " +
        "`percentage` per category is its share of the total (0-100). A categoryId of null is the Uncategorized bucket. " +
        "The call fails if an FX rate needed for the conversion is unavailable.";
    readonly inputSchema = inputSchema;

    constructor(private readonly reports: ReportsService) {}

    async execute(userId: string, input: z.infer<typeof inputSchema>): Promise<unknown> {
        const report = await this.reports.getSpendingReport(userId, {
            startDate: input.startDate,
            endDate: input.endDate,
            currency: input.currency ?? DEFAULT_CURRENCY_CODE,
        });
        return {
            startDate: report.startDate,
            endDate: report.endDate,
            currency: report.currency.code,
            total: report.total,
            transactionCount: report.transactionCount,
            comparison: {
                startDate: report.comparison.startDate,
                endDate: report.comparison.endDate,
                total: report.comparison.total,
                changePercentage: report.comparison.changePercentage,
                direction: report.comparison.direction,
            },
            categories: toColumnar(
                ["categoryId", "name", "amount", "percentage", "transactionCount"],
                report.categories.map((c) => ({
                    categoryId: c.categoryId,
                    name: c.name,
                    amount: c.amount,
                    percentage: c.percentage,
                    transactionCount: c.transactionCount,
                })),
            ),
        };
    }
}
