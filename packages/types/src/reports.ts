// Spending report

/**
 * Which period a spending report compares against. `previous` is the period
 * preceding the window; `yearOverYear` is the same dates one year earlier.
 */
export type ReportCompareMode = "previous" | "yearOverYear";

export interface SpendingReportCurrency {
    code: string;
    symbol: string;
}

export interface SpendingReportCategoryItem {
    /** Null for the "Uncategorized" bucket. */
    categoryId: string | null;
    name: string;
    color: string;
    icon: string | null;
    /** Total spent in this category, in the report's display currency. */
    amount: number;
    /** Share of the report total, 0-100 with 1 decimal. 0 when the total is 0. */
    percentage: number;
    transactionCount: number;
}

export interface SpendingReportComparison {
    /** Comparison period (per the request's compare mode), inclusive YYYY-MM-DD bounds. */
    startDate: string;
    endDate: string;
    total: number;
    /** Percent change vs the previous period; null when the previous total is 0. */
    changePercentage: number | null;
    direction: "up" | "down" | "flat";
}

export interface SpendingReport {
    startDate: string;
    endDate: string;
    currency: SpendingReportCurrency;
    total: number;
    transactionCount: number;
    comparison: SpendingReportComparison;
    /** All categories with spending in the period, sorted by amount descending. */
    categories: SpendingReportCategoryItem[];
}

// Monthly spending

export interface MonthlySpendingPoint {
    /** Calendar month, YYYY-MM. */
    month: string;
    /** Total spent in this month, in the report's display currency. */
    total: number;
    transactionCount: number;
}

export interface MonthlySpending {
    /** Inclusive YYYY-MM bounds of the requested range. */
    startMonth: string;
    endMonth: string;
    currency: SpendingReportCurrency;
    /** One entry per month in the range, ascending; months without spending are zero-filled. */
    months: MonthlySpendingPoint[];
    /** Earliest month with a counted expense (any date), or null when there is none. */
    firstMonth: string | null;
}
