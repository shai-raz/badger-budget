import { describe, expect, it } from "vitest";
import {
    DEFAULT_TRANSACTION_FILTERS,
    parseTransactionFilters,
    sameTransactionFilters,
    serializeTransactionFilters,
    withTransactionFilters,
    type TransactionFilterState,
} from "./transactionFilterQuery";

const FULL: TransactionFilterState = {
    search: "rent",
    types: ["income", "expense"],
    accountIds: ["acc-a", "acc-b"],
    categoryIds: ["cat-a", "cat-b"],
    sort: "amount-asc",
    showHidden: true,
};

describe("parseTransactionFilters", () => {
    it("reads an empty query as the defaults", () => {
        expect(parseTransactionFilters({})).toEqual(DEFAULT_TRANSACTION_FILTERS);
    });

    it("reads every filter key", () => {
        expect(
            parseTransactionFilters({
                q: "rent",
                types: "income,expense",
                accounts: "acc-a,acc-b",
                categories: "cat-a,cat-b",
                sort: "amount-asc",
                hidden: "1",
            }),
        ).toEqual(FULL);
    });

    it("trims the search text", () => {
        expect(parseTransactionFilters({ q: "  rent  " }).search).toBe("rent");
    });

    it("falls back to defaults for unknown or malformed values", () => {
        expect(
            parseTransactionFilters({
                sort: "bogus",
                types: "x,,",
                accounts: ",,",
                hidden: "yes",
                categories: ",,",
                q: "",
            }),
        ).toEqual(DEFAULT_TRANSACTION_FILTERS);
    });

    it("treats hidden as on only for exactly 1", () => {
        expect(parseTransactionFilters({ hidden: "0" }).showHidden).toBe(false);
        expect(parseTransactionFilters({ hidden: "true" }).showHidden).toBe(false);
        expect(parseTransactionFilters({ hidden: "1" }).showHidden).toBe(true);
    });

    it("drops blank and repeated category entries and keeps the order given", () => {
        expect(parseTransactionFilters({ categories: " b ,, a ,b," }).categoryIds).toEqual(["b", "a"]);
    });

    it("drops blank and repeated account entries and keeps the order given", () => {
        expect(parseTransactionFilters({ accounts: " b ,, a ,b," }).accountIds).toEqual(["b", "a"]);
    });

    it("reads types in canonical order, drops unknown ones and collapses repeats", () => {
        expect(parseTransactionFilters({ types: "transfer,bogus,income,transfer,expense" }).types).toEqual([
            "income",
            "expense",
            "transfer",
        ]);
    });

    it("reads a repeated key as its first value, or joins repeated categories and accounts", () => {
        expect(parseTransactionFilters({ q: ["first", "second"] }).search).toBe("first");
        expect(parseTransactionFilters({ categories: ["a,b", "c"] }).categoryIds).toEqual(["a", "b", "c"]);
        expect(parseTransactionFilters({ accounts: ["a,b", "c"] }).accountIds).toEqual(["a", "b", "c"]);
        expect(parseTransactionFilters({ types: ["expense", "income"] }).types).toEqual(["income", "expense"]);
    });

    it("ignores values that are not strings", () => {
        expect(
            parseTransactionFilters({ q: 42, types: null, accounts: { x: 1 }, sort: undefined, categories: { x: 1 } }),
        ).toEqual(DEFAULT_TRANSACTION_FILTERS);
    });

    it("ignores the retired single-type key", () => {
        expect(parseTransactionFilters({ type: "expense" })).toEqual(DEFAULT_TRANSACTION_FILTERS);
    });

    it("reads an explicit default value as the default", () => {
        expect(parseTransactionFilters({ sort: "newest" })).toEqual(DEFAULT_TRANSACTION_FILTERS);
    });
});

describe("serializeTransactionFilters", () => {
    it("omits every default value, so a bare page has no filter params", () => {
        expect(serializeTransactionFilters(DEFAULT_TRANSACTION_FILTERS)).toEqual({});
    });

    it("writes every non-default value under its key", () => {
        expect(serializeTransactionFilters(FULL)).toEqual({
            q: "rent",
            types: "income,expense",
            accounts: "acc-a,acc-b",
            categories: "cat-a,cat-b",
            sort: "amount-asc",
            hidden: "1",
        });
    });

    it("writes types in canonical order", () => {
        expect(serializeTransactionFilters({ ...DEFAULT_TRANSACTION_FILTERS, types: ["transfer", "income"] })).toEqual({
            types: "transfer,income",
        });
    });

    it("round-trips through parse", () => {
        for (const state of [
            DEFAULT_TRANSACTION_FILTERS,
            FULL,
            { ...DEFAULT_TRANSACTION_FILTERS, sort: "name" as const },
            {
                ...DEFAULT_TRANSACTION_FILTERS,
                types: ["income", "expense", "transfer"] as TransactionFilterState["types"],
            },
        ]) {
            expect(parseTransactionFilters(serializeTransactionFilters(state))).toEqual(state);
        }
    });
});

describe("withTransactionFilters", () => {
    it("keeps keys the filters do not own, such as the period and deep-link keys", () => {
        expect(withTransactionFilters({ from: "2026-07", to: "2026-09", create: "expense", q: "old" }, FULL)).toEqual({
            from: "2026-07",
            to: "2026-09",
            create: "expense",
            q: "rent",
            types: "income,expense",
            accounts: "acc-a,acc-b",
            categories: "cat-a,cat-b",
            sort: "amount-asc",
            hidden: "1",
        });
    });

    it("removes a filter key that is back at its default", () => {
        expect(
            withTransactionFilters({ from: "all", types: "income", hidden: "1" }, DEFAULT_TRANSACTION_FILTERS),
        ).toEqual({
            from: "all",
        });
    });

    it("drops the retired single-type key on any write", () => {
        expect(withTransactionFilters({ type: "expense", create: "expense" }, DEFAULT_TRANSACTION_FILTERS)).toEqual({
            create: "expense",
        });
    });

    it("drops from and to on resetPeriod, and keeps the other keys", () => {
        expect(
            withTransactionFilters(
                { from: "2026-07", to: "2026-09", create: "expense", types: "income" },
                DEFAULT_TRANSACTION_FILTERS,
                { resetPeriod: true },
            ),
        ).toEqual({ create: "expense" });
    });
});

describe("sameTransactionFilters", () => {
    it("treats states that serialise the same as equal", () => {
        expect(sameTransactionFilters(FULL, { ...FULL, search: "rent" })).toBe(true);
        expect(
            sameTransactionFilters(DEFAULT_TRANSACTION_FILTERS, {
                ...DEFAULT_TRANSACTION_FILTERS,
                types: [],
            }),
        ).toBe(true);
    });

    it("treats a changed value as different", () => {
        expect(sameTransactionFilters(FULL, { ...FULL, showHidden: false })).toBe(false);
        expect(sameTransactionFilters(FULL, { ...FULL, categoryIds: ["cat-a"] })).toBe(false);
        expect(sameTransactionFilters(FULL, { ...FULL, accountIds: ["acc-a"] })).toBe(false);
        expect(sameTransactionFilters(FULL, { ...FULL, types: ["income"] })).toBe(false);
    });
});
