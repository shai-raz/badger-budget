import type {
    AccountRuleOutcome,
    AvatarIconName,
    RuleActionType,
    RuleApplyMode,
    RuleConditionField,
    RuleOperator,
    RulePreviewFilter,
    TransactionType,
} from "@badger/shared-data";

export type { TransactionType };

// User & Authentication
export interface User {
    id: string;
    email: string;
    name: string;
    createdAt: Date;
    updatedAt: Date;
}

// Budget
export interface Budget {
    id: string;
    userId: string;
    name: string;
    amount: number;
    currencyId: string;
    period: "daily" | "weekly" | "monthly" | "yearly";
    /**
     * Canonical category linkage for budget spend attribution.
     * At least one category ID is required.
     */
    categoryIds: string[];
    /**
     * @deprecated Use categoryIds instead.
     */
    categoryId?: string;
    accountId?: string;
    startDate?: Date;
    endDate?: Date;
    createdAt: Date;
    updatedAt: Date;
    deletedAt?: Date;
}

export interface CreateBudgetDto {
    name: string;
    amount: number;
    currencyId: string;
    period: "daily" | "weekly" | "monthly" | "yearly";
    /**
     * Canonical category linkage for budget creation.
     * Must include at least one category ID.
     */
    categoryIds: string[];
    startDate?: Date;
    endDate?: Date;
    /**
     * @deprecated Use categoryIds instead.
     */
    categoryId?: string;
    accountId?: string;
}

export interface UpdateBudgetDto extends Partial<CreateBudgetDto> {}

// Category
export interface Category {
    id: string;
    userId: string | null;
    name: string;
    color: string;
    icon?: string;
    isSystem: boolean;
    createdAt: Date;
    updatedAt: Date;
    deletedAt?: Date;
}

export interface CreateCategoryDto {
    name: string;
    color: string;
    /** null clears the icon; omitted lets the server pick one from the name. */
    icon?: AvatarIconName | null;
}

export interface UpdateCategoryDto extends Partial<CreateCategoryDto> {}

export interface CategoryUsageResponse {
    transactionCount: number;
    budgetCount: number;
    /** Live rules whose set_category action targets the category. */
    ruleCount: number;
    totalCount: number;
}

export interface DeleteCategoryOptions {
    /** When set, transactions, budgets and rules move to this category instead of becoming uncategorized. */
    transferToCategoryId?: string;
    /** Only meaningful when transferring. Default true on the server. When false, rules are deleted instead of re-pointed. */
    moveRules?: boolean;
}

// Rules (conditions and actions)
export interface IRuleCondition {
    id: string;
    field: RuleConditionField;
    operator: RuleOperator;
    value: string;
    position: number;
}

export interface IRuleAction {
    id: string;
    type: RuleActionType;
    value: string;
    position: number;
}

export interface IRule {
    id: string;
    name: string;
    priority: number;
    stopOnMatch: boolean;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
    conditions: IRuleCondition[];
    actions: IRuleAction[];
}

export interface RuleConditionInput {
    field: RuleConditionField;
    operator: RuleOperator;
    value: string;
}

export interface RuleActionInput {
    type: RuleActionType;
    value: string;
}

export interface RuleDraft {
    conditions: RuleConditionInput[];
    actions: RuleActionInput[];
}

/** Which previewed transactions a save-and-apply touches: all except the ids, or only the ids. */
export interface ApplyRuleSelection {
    mode: RuleApplyMode;
    ids: string[];
}

export interface CreateRuleDto extends RuleDraft {
    name: string;
    stopOnMatch?: boolean;
    apply?: ApplyRuleSelection;
}

export interface UpdateRuleDto extends RuleDraft {
    name: string;
    stopOnMatch: boolean;
    apply?: ApplyRuleSelection;
}

export interface RuleSaveResponse {
    rule: IRule;
    /** Number of transactions changed by save-and-apply; null when nothing was applied. */
    appliedCount: number | null;
}

export interface ReorderRulesDto {
    ids: string[];
}

export interface RulePreviewRequest extends RuleDraft {
    filter?: RulePreviewFilter;
    search?: string;
    page?: number;
}

export interface RulePreviewItem {
    id: string;
    description: string;
    transactionDate: string;
    amount: number;
    type: TransactionType;
    /** Set for transfers; the review signs an incoming one with a plus. */
    transferDirection: "in" | "out" | null;
    currencyCode: string;
    accountName: string | null;
    category: { id: string; name: string; color: string; icon: string | null } | null;
}

export interface RulePreviewResponse {
    matchCount: number;
    wouldChangeCount: number;
    alreadyTargetCount: number;
    counts: { all: number; uncategorized: number; categorized: number };
    items: RulePreviewItem[];
    page: number;
    totalPages: number;
}

export interface ApplyRuleResponse {
    count: number;
}

export interface AccountRuleUsageResponse {
    rules: { id: string; name: string; outcome: AccountRuleOutcome }[];
}

// Transaction
// Direction of money movement for transfers: "out" leaves the account
// (e.g. bank → savings), "in" enters it. Always null for income/expense.
export type TransferDirection = "in" | "out";

export interface Transaction {
    id: string;
    userId: string;
    budgetId?: string;
    categoryId?: string;
    type: TransactionType;
    amount: number;
    description: string;
    date: Date;
    createdAt: Date;
    updatedAt: Date;
}

export interface CreateTransactionDto {
    budgetId?: string;
    categoryId?: string;
    type: TransactionType;
    amount: number;
    description: string;
    date: Date;
}

export interface UpdateTransactionDto extends Partial<CreateTransactionDto> {}

// Analytics & Reports
export interface BudgetAnalytics {
    budgetId: string;
    budgetName: string;
    amount: number;
    currencyId: string;
    currencyDisplay: {
        code: string;
        symbol: string;
    };
    categories: Category[];
    period: "daily" | "weekly" | "monthly" | "yearly";
    periodStart: Date;
    periodEnd: Date;
    totalSpent: number;
    remaining: number;
    percentageUsed: number;
    transactionCount: number;
    isOverBudget: boolean;
    /**
     * Whether the budget's lifecycle (startDate/endDate) overlaps the viewed
     * period window. When `false`, the budget did not exist for this period and
     * the spend figures are zeroed — the UI renders a "No budget set for this
     * period" empty state instead of the totals/progress.
     */
    existsInPeriod: boolean;
}

/**
 * Canonical rules for budget period boundaries and spend inclusion.
 */
export interface BudgetPeriodBoundaryRules {
    /**
     * Period windows are computed in the user's timezone.
     */
    timezoneSource: "user-profile-timezone";
    /**
     * Daily period starts at local 00:00:00 and ends at local 23:59:59.999.
     */
    dailyBoundary: "start-of-day to end-of-day (inclusive)";
    /**
     * Weekly period starts at local week start and ends at local week end (inclusive).
     */
    weeklyBoundary: "start-of-week to end-of-week (inclusive)";
    /**
     * Monthly period starts at first local day and ends at last local day (inclusive).
     */
    monthlyBoundary: "start-of-month to end-of-month (inclusive)";
    /**
     * Yearly period starts at Jan 1 local time and ends at Dec 31 local time (inclusive).
     */
    yearlyBoundary: "start-of-year to end-of-year (inclusive)";
    /**
     * Budget spend only includes expense transactions whose categories overlap with budget.categoryIds.
     */
    spendInclusion: "expense-only + category-overlap";
}

/**
 * Canonical FX conversion rules for budget spend normalization.
 */
export interface BudgetFxConversionRules {
    /**
     * For historical transactions, use the historical rate for the transaction timestamp.
     */
    historicalRule: "use historical rate at transaction time";
    /**
     * If transaction carries a stored FX snapshot, that snapshot is authoritative.
     */
    snapshotRule: "prefer stored conversion snapshot when present";
    /**
     * Budget spend is normalized into the budget currency before aggregation.
     */
    normalizationTarget: "budget currency";
}

export interface BudgetDashboard {
    budgets: Array<
        BudgetAnalytics & {
            account?: any;
        }
    >;
    totalBudgets: number;
    overBudgetCount: number;
}

/**
 * Response for a single period-type section of the budgets page, fetched with
 * `?period=<type>&periodOffset=<n>`. Extends the dashboard payload with the
 * section's reference cursor and its representative window (used to label the
 * `‹ ›` navigation independently of any individual budget's anchor).
 */
export interface BudgetPeriodSummary extends BudgetDashboard {
    period: "daily" | "weekly" | "monthly" | "yearly";
    periodOffset: number;
    periodStart: Date;
    periodEnd: Date;
}

export interface BudgetSummary {
    budgetId: string;
    budgetName: string;
    totalBudget: number;
    totalSpent: number;
    remaining: number;
    percentageUsed: number;
}

export interface CategorySummary {
    categoryId: string;
    categoryName: string;
    categoryColor: string;
    totalAmount: number;
    transactionCount: number;
}

export interface PeriodSummary {
    period: string;
    income: number;
    expenses: number;
    netAmount: number;
    transactionCount: number;
}

// API Response Types
export interface ApiResponse<T> {
    data: T;
    message?: string;
}

export interface PaginatedResponse<T> {
    data: T[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
}

export interface ApiError {
    error: string;
    message: string;
    statusCode: number;
}

export * from "./app-config";
export * from "./transactions";
export * from "./card-payoff-patterns";
export * from "./cash-withdrawal-patterns";
export * from "./bank-scraping";
export * from "./reports";
export * from "./oauth";
export * from "./reimbursements";
export * from "./system";
export * from "./auth";
