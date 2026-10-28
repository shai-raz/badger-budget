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
    type: "expense",
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
                type: "expense",
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
                type: "x",
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

    it("reads a repeated key as its first value, or joins repeated categories", () => {
        expect(parseTransactionFilters({ q: ["first", "second"] }).search).toBe("first");
        expect(parseTransactionFilters({ categories: ["a,b", "c"] }).categoryIds).toEqual(["a", "b", "c"]);
    });

    it("ignores values that are not strings", () => {
        expect(parseTransactionFilters({ q: 42, type: null, sort: undefined, categories: { x: 1 } })).toEqual(
            DEFAULT_TRANSACTION_FILTERS,
        );
    });

    it("reads an explicit default value as the default", () => {
        expect(parseTransactionFilters({ type: "all", sort: "newest" })).toEqual(DEFAULT_TRANSACTION_FILTERS);
    });
});

describe("serializeTransactionFilters", () => {
    it("omits every default value, so a bare page has no filter params", () => {
        expect(serializeTransactionFilters(DEFAULT_TRANSACTION_FILTERS)).toEqual({});
    });

    it("writes every non-default value under its key", () => {
        expect(serializeTransactionFilters(FULL)).toEqual({
            q: "rent",
            type: "expense",
            categories: "cat-a,cat-b",
            sort: "amount-asc",
            hidden: "1",
        });
    });

    it("round-trips through parse", () => {
        for (const state of [
            DEFAULT_TRANSACTION_FILTERS,
            FULL,
            { ...DEFAULT_TRANSACTION_FILTERS, sort: "name" as const },
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
            type: "expense",
            categories: "cat-a,cat-b",
            sort: "amount-asc",
            hidden: "1",
        });
    });

    it("removes a filter key that is back at its default", () => {
        expect(
            withTransactionFilters({ from: "all", type: "income", hidden: "1" }, DEFAULT_TRANSACTION_FILTERS),
        ).toEqual({
            from: "all",
        });
    });
});

describe("sameTransactionFilters", () => {
    it("treats states that serialise the same as equal", () => {
        expect(sameTransactionFilters(FULL, { ...FULL, search: "rent" })).toBe(true);
        expect(
            sameTransactionFilters(DEFAULT_TRANSACTION_FILTERS, { ...DEFAULT_TRANSACTION_FILTERS, type: "all" }),
        ).toBe(true);
    });

    it("treats a changed value as different", () => {
        expect(sameTransactionFilters(FULL, { ...FULL, showHidden: false })).toBe(false);
        expect(sameTransactionFilters(FULL, { ...FULL, categoryIds: ["cat-a"] })).toBe(false);
    });
});
