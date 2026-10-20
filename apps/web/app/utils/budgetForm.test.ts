import { describe, expect, it } from "vitest";
import type { Budget, ICurrencyResponse } from "@badger/types";
import { DEFAULT_CURRENCY_CODE } from "@badger/shared-data";
import {
    BUDGET_PERIOD_OPTIONS,
    buildBudgetPayload,
    budgetToFormValues,
    createInitialBudgetValues,
    validateBudgetForm,
    type BudgetFormValues,
} from "./budgetForm";

const currency = (id: string, code: string) =>
    ({ id, code, name: code, symbol: code, createdAt: new Date(), updatedAt: new Date() }) as ICurrencyResponse;

const currencies = [currency("eur", "EUR"), currency("usd", "USD"), currency("gbp", "GBP")];

const validValues = (overrides: Partial<BudgetFormValues> = {}): BudgetFormValues => ({
    name: "  Groceries  ",
    amount: 250,
    currencyId: "usd",
    period: "monthly",
    startDate: new Date(2026, 9, 1),
    categoryIds: ["cat-1"],
    ...overrides,
});

describe("createInitialBudgetValues", () => {
    it("picks the locale currency when it is available", () => {
        const values = createInitialBudgetValues(currencies, {
            localeCurrencyCode: "GBP",
            now: new Date(2026, 9, 14),
        });
        expect(values.currencyId).toBe("gbp");
    });

    it("falls back to the shared default currency when the locale currency is not in the list", () => {
        const list = [currency("eur", "EUR"), currency("ils", DEFAULT_CURRENCY_CODE), currency("gbp", "GBP")];
        const values = createInitialBudgetValues(list, { localeCurrencyCode: "JPY" });
        expect(values.currencyId).toBe("ils");
    });

    it("falls back to the first currency when neither the locale nor the default is available", () => {
        const values = createInitialBudgetValues([currency("eur", "EUR"), currency("gbp", "GBP")], {
            localeCurrencyCode: "JPY",
        });
        expect(values.currencyId).toBe("eur");
    });

    it("starts blank, monthly, dated today with no categories", () => {
        const now = new Date(2026, 9, 14, 23, 30);
        const values = createInitialBudgetValues(currencies, { localeCurrencyCode: "USD", now });
        expect(values).toEqual({
            name: "",
            amount: null,
            currencyId: "usd",
            period: "monthly",
            startDate: now,
            categoryIds: [],
        });
    });
});

describe("budgetToFormValues", () => {
    const base = {
        id: "b1",
        userId: "u1",
        name: "Rent",
        amount: 1200,
        currencyId: "usd",
        period: "monthly",
        categoryIds: [],
        createdAt: new Date(),
        updatedAt: new Date(),
    } as Budget;

    it("prefers the join-table categories", () => {
        const values = budgetToFormValues({
            ...base,
            categoryId: "legacy",
            categories: [{ id: "a" }, { id: "b" }],
        });
        expect(values.categoryIds).toEqual(["a", "b"]);
    });

    it("falls back to the legacy categoryId when the join table is empty", () => {
        expect(budgetToFormValues({ ...base, categoryId: "legacy", categories: [] }).categoryIds).toEqual(["legacy"]);
        expect(budgetToFormValues({ ...base, categoryId: "legacy" }).categoryIds).toEqual(["legacy"]);
    });

    it("returns no categories when neither source has one", () => {
        expect(budgetToFormValues(base).categoryIds).toEqual([]);
    });

    it("keeps the calendar day of an ISO start date", () => {
        const values = budgetToFormValues({ ...base, startDate: "2026-03-01T00:00:00.000Z" as unknown as Date });
        expect(values.startDate).toEqual(new Date(2026, 2, 1));
        expect(values.startDate?.getDate()).toBe(1);
    });

    it("does not shift a late-evening UTC date into the previous local day", () => {
        const values = budgetToFormValues({ ...base, startDate: "2026-10-31T23:59:00.000Z" as unknown as Date });
        expect(values.startDate).toEqual(new Date(2026, 9, 31));
    });

    it("maps name, amount, currency and period", () => {
        const values = budgetToFormValues({ ...base, amount: "99.5" as unknown as number, period: "weekly" });
        expect(values).toMatchObject({ name: "Rent", amount: 99.5, currencyId: "usd", period: "weekly" });
    });
});

describe("validateBudgetForm", () => {
    it("returns no errors for a complete form", () => {
        expect(validateBudgetForm(validValues())).toEqual({});
    });

    it("requires a non-blank name", () => {
        expect(validateBudgetForm(validValues({ name: "   " })).name).toBe("Enter a name");
    });

    it.each([null, 0, -5, Number.NaN])("rejects the amount %s", (amount) => {
        expect(validateBudgetForm(validValues({ amount })).amount).toBe("Enter an amount greater than 0");
    });

    it("requires a currency", () => {
        expect(validateBudgetForm(validValues({ currencyId: null })).currencyId).toBe("Choose a currency");
    });

    it("requires a start date", () => {
        expect(validateBudgetForm(validValues({ startDate: null })).startDate).toBe("Choose a start date");
    });

    it("requires at least one category", () => {
        expect(validateBudgetForm(validValues({ categoryIds: [] })).categoryIds).toBe("Choose at least one category");
    });

    it("reports every failing field at once", () => {
        expect(
            validateBudgetForm({
                name: "",
                amount: null,
                currencyId: null,
                period: "daily",
                startDate: null,
                categoryIds: [],
            }),
        ).toEqual({
            name: "Enter a name",
            amount: "Enter an amount greater than 0",
            currencyId: "Choose a currency",
            startDate: "Choose a start date",
            categoryIds: "Choose at least one category",
        });
    });
});

describe("buildBudgetPayload", () => {
    it("returns null when the form is invalid", () => {
        expect(buildBudgetPayload(validValues({ amount: 0 }))).toBeNull();
    });

    it("builds the request body with a trimmed name and a local YYYY-MM-DD start date", () => {
        expect(buildBudgetPayload(validValues({ startDate: new Date(2026, 0, 5, 23, 59) }))).toEqual({
            name: "Groceries",
            amount: 250,
            currencyId: "usd",
            period: "monthly",
            startDate: "2026-01-05",
            categoryIds: ["cat-1"],
        });
    });

    it("copies the category list so later edits do not leak into the payload", () => {
        const values = validValues({ categoryIds: ["a"] });
        const payload = buildBudgetPayload(values);
        values.categoryIds.push("b");
        expect(payload?.categoryIds).toEqual(["a"]);
    });
});

describe("BUDGET_PERIOD_OPTIONS", () => {
    it("lists the four periods in order", () => {
        expect(BUDGET_PERIOD_OPTIONS.map((o) => o.value)).toEqual(["daily", "weekly", "monthly", "yearly"]);
    });
});
