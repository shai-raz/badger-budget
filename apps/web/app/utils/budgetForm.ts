import type { Budget, ICurrencyResponse } from "@badger/types";
import type { BudgetPeriod } from "./budget";
import { resolveDefaultCurrencyId } from "./transactionForm";
import { toLocalIsoDate } from "./localDate";

export interface BudgetFormValues {
    name: string;
    amount: number | null;
    currencyId: string | null;
    period: BudgetPeriod;
    startDate: Date | null;
    categoryIds: string[];
}

export interface BudgetFormPayload {
    name: string;
    amount: number;
    currencyId: string;
    period: BudgetPeriod;
    /** YYYY-MM-DD in local time. */
    startDate: string;
    categoryIds: string[];
}

export type BudgetFormErrors = Partial<Record<keyof BudgetFormValues, string>>;

type CurrencyRef = Pick<ICurrencyResponse, "id" | "code">;

export const BUDGET_PERIOD_OPTIONS: { label: string; value: BudgetPeriod }[] = [
    { label: "Daily", value: "daily" },
    { label: "Weekly", value: "weekly" },
    { label: "Monthly", value: "monthly" },
    { label: "Yearly", value: "yearly" },
];

export function createInitialBudgetValues(
    currencies: CurrencyRef[],
    opts: { localeCurrencyCode: string; now?: Date },
): BudgetFormValues {
    return {
        name: "",
        amount: null,
        currencyId: resolveDefaultCurrencyId(null, currencies, opts.localeCurrencyCode),
        period: "monthly",
        startDate: opts.now ?? new Date(),
        categoryIds: [],
    };
}

/** Date-only ISO string ("YYYY-MM-DD") parsed as local midnight, so the calendar day never shifts. */
function parseBudgetStartDate(value: Budget["startDate"]): Date | null {
    if (!value) return null;
    const iso = typeof value === "string" ? value : value.toISOString();
    const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
    if (!y || !m || !d) return null;
    return new Date(y, m - 1, d);
}

export function budgetToFormValues(budget: Budget & { categories?: Array<{ id: string }> }): BudgetFormValues {
    const fromJoinTable = Array.isArray(budget.categories) ? budget.categories.map((category) => category.id) : [];
    const categoryIds = fromJoinTable.length > 0 ? fromJoinTable : budget.categoryId ? [budget.categoryId] : [];

    return {
        name: budget.name,
        amount: Number(budget.amount),
        currencyId: budget.currencyId,
        period: budget.period,
        startDate: parseBudgetStartDate(budget.startDate) ?? new Date(),
        categoryIds,
    };
}

export function validateBudgetForm(v: BudgetFormValues): BudgetFormErrors {
    const errors: BudgetFormErrors = {};
    if (!v.name.trim()) errors.name = "Enter a name";
    if (v.amount === null || Number.isNaN(v.amount) || v.amount <= 0) {
        errors.amount = "Enter an amount greater than 0";
    }
    if (!v.currencyId) errors.currencyId = "Choose a currency";
    if (!v.startDate) errors.startDate = "Choose a start date";
    if (v.categoryIds.length === 0) errors.categoryIds = "Choose at least one category";
    return errors;
}

/** Null when the form is invalid; otherwise the request body with a trimmed name and a local YYYY-MM-DD start date. */
export function buildBudgetPayload(v: BudgetFormValues): BudgetFormPayload | null {
    if (Object.keys(validateBudgetForm(v)).length > 0) return null;
    if (v.amount === null || !v.currencyId || !v.startDate) return null;
    return {
        name: v.name.trim(),
        amount: v.amount,
        currencyId: v.currencyId,
        period: v.period,
        startDate: toLocalIsoDate(v.startDate),
        categoryIds: [...v.categoryIds],
    };
}
