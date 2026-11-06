import type { ITransactionsSummaryResponse } from "@badger/types";
import { formatCurrency } from "~/utils/currency";

export const POSITIVE_METRIC_CLASS = "text-income";
export const NEGATIVE_METRIC_CLASS = "text-expense";
export const NEUTRAL_METRIC_CLASS = "text-surface-600 dark:text-surface-300";

export interface MetricCell {
    key: string;
    label: string;
    /** Fully formatted, sign-prefixed value; empty string when no summary. */
    display: string;
    colorClass: string;
}

export interface SummaryMetrics {
    income: MetricCell;
    expenses: MetricCell;
    net: MetricCell;
    transferred: MetricCell;
    available: MetricCell;
}

/**
 * The five transaction totals as display-ready cells, shared by the desktop
 * metrics strip and the mobile totals card. Colours follow the app's
 * income/expense convention (income/positive = teal, expense/negative = rose).
 */
export function summaryMetrics(summary: ITransactionsSummaryResponse | undefined): SummaryMetrics {
    const code = summary?.currencyCode;
    const signed = (value: number) => (value >= 0 ? "+" : "") + formatCurrency(value, code);

    return {
        income: {
            key: "income",
            label: "Income",
            display: summary ? `+${formatCurrency(summary.income, code)}` : "",
            colorClass: POSITIVE_METRIC_CLASS,
        },
        expenses: {
            key: "expenses",
            label: "Expenses",
            display: summary ? `-${formatCurrency(summary.expenses, code)}` : "",
            colorClass: NEGATIVE_METRIC_CLASS,
        },
        net: {
            key: "net",
            label: "Net",
            display: summary ? signed(summary.net) : "",
            colorClass: summary && summary.net < 0 ? NEGATIVE_METRIC_CLASS : POSITIVE_METRIC_CLASS,
        },
        transferred: {
            key: "transferred",
            label: "Transferred",
            display: summary ? formatCurrency(summary.transferred, code) : "",
            colorClass: NEUTRAL_METRIC_CLASS,
        },
        available: {
            key: "available",
            label: "Available",
            display: summary ? signed(summary.available) : "",
            colorClass: summary && summary.available < 0 ? NEGATIVE_METRIC_CLASS : POSITIVE_METRIC_CLASS,
        },
    };
}
