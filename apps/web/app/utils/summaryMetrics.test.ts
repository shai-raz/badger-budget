import type { ITransactionsSummaryResponse } from "@badger/types";
import { describe, expect, it } from "vitest";
import { summaryMetrics } from "./summaryMetrics";

const summary: ITransactionsSummaryResponse = {
    income: 1000,
    expenses: 400,
    net: 600,
    transferred: 150,
    available: 450,
    count: 12,
    currencyCode: "USD",
};

describe("summaryMetrics", () => {
    it("formats each total with its sign and currency", () => {
        const metrics = summaryMetrics(summary);

        expect(metrics.income.display).toBe("+$1,000.00");
        expect(metrics.expenses.display).toBe("-$400.00");
        expect(metrics.net.display).toBe("+$600.00");
        expect(metrics.transferred.display).toBe("$150.00");
        expect(metrics.available.display).toBe("+$450.00");
    });

    it("keeps the label and key for each cell", () => {
        const metrics = summaryMetrics(summary);

        expect(metrics.income).toMatchObject({ key: "income", label: "Income" });
        expect(metrics.expenses).toMatchObject({ key: "expenses", label: "Expenses" });
        expect(metrics.net).toMatchObject({ key: "net", label: "Net" });
        expect(metrics.transferred).toMatchObject({ key: "transferred", label: "Transferred" });
        expect(metrics.available).toMatchObject({ key: "available", label: "Available" });
    });

    it("colours income and expenses by their convention, transfers neutral", () => {
        const metrics = summaryMetrics(summary);

        expect(metrics.income.colorClass).toBe("text-income");
        expect(metrics.expenses.colorClass).toBe("text-expense");
        expect(metrics.transferred.colorClass).toBe("text-surface-600 dark:text-surface-300");
    });

    it("colours net and available by sign", () => {
        const negative = summaryMetrics({ ...summary, net: -50, available: -200 });

        expect(negative.net.display).toBe("-$50.00");
        expect(negative.net.colorClass).toBe("text-expense");
        expect(negative.available.display).toBe("-$200.00");
        expect(negative.available.colorClass).toBe("text-expense");
    });

    it("treats a zero net as positive", () => {
        const metrics = summaryMetrics({ ...summary, net: 0 });

        expect(metrics.net.display).toBe("+$0.00");
        expect(metrics.net.colorClass).toBe("text-income");
    });

    it("returns empty displays when there is no summary", () => {
        const metrics = summaryMetrics(undefined);

        for (const cell of Object.values(metrics)) {
            expect(cell.display).toBe("");
        }
    });

    it("falls back to ILS when the summary has no currency code", () => {
        const metrics = summaryMetrics({ ...summary, currencyCode: "" });

        expect(metrics.income.display).toBe("+₪1,000.00");
    });
});
