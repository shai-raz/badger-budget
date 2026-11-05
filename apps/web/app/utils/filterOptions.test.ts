import { describe, expect, it } from "vitest";
import { DEFAULT_CATEGORY_AVATAR_ICON } from "@badger/shared-data";
import {
    buildAccountFilterOptions,
    buildCategoryFilterOptions,
    buildTypeFilterOptions,
    transactionCountLabel,
    UNCATEGORIZED_COLOR,
    UNCATEGORIZED_VALUE,
    type AccountFilterOptionsInput,
    type CategoryFilterOptionsInput,
    type TypeFilterOptionsInput,
} from "./filterOptions";

const categories: CategoryFilterOptionsInput["categories"] = [
    { id: "c-groceries", name: "Groceries", icon: "shopping-cart", color: "#10B981" },
    { id: "c-rent", name: "Rent", icon: null, color: "#3B82F6" },
    { id: "c-fun", name: "Fun", icon: "gamepad-2", color: "#F59E0B" },
];

const buildCategories = (overrides: Partial<CategoryFilterOptionsInput> = {}) =>
    buildCategoryFilterOptions({
        categories,
        facets: [],
        facetFailed: false,
        selectedIds: [],
        ...overrides,
    });

const UNCATEGORIZED_AVATAR = {
    kind: "entity",
    icon: null,
    color: UNCATEGORIZED_COLOR,
    fallback: "circle-help",
};

describe("buildCategoryFilterOptions", () => {
    it("offers only the facet categories, with their counts", () => {
        const options = buildCategories({
            facets: [
                { categoryId: "c-rent", count: 2 },
                { categoryId: "c-groceries", count: 14 },
            ],
        });

        expect(options).toEqual([
            {
                value: "c-groceries",
                label: "Groceries",
                avatar: {
                    kind: "entity",
                    icon: "shopping-cart",
                    color: "#10B981",
                    fallback: DEFAULT_CATEGORY_AVATAR_ICON,
                },
                count: 14,
                stale: false,
            },
            {
                value: "c-rent",
                label: "Rent",
                avatar: { kind: "entity", icon: null, color: "#3B82F6", fallback: DEFAULT_CATEGORY_AVATAR_ICON },
                count: 2,
                stale: false,
            },
        ]);
    });

    it("carries the category icon on the avatar", () => {
        const options = buildCategories({ facets: [{ categoryId: "c-fun", count: 1 }] });

        expect(options[0]?.avatar).toEqual({
            kind: "entity",
            icon: "gamepad-2",
            color: "#F59E0B",
            fallback: DEFAULT_CATEGORY_AVATAR_ICON,
        });
    });

    it("maps a null facet to Uncategorized, which comes first", () => {
        const options = buildCategories({
            facets: [
                { categoryId: "c-rent", count: 2 },
                { categoryId: null, count: 5 },
            ],
        });

        expect(options[0]).toEqual({
            value: UNCATEGORIZED_VALUE,
            label: "Uncategorized",
            avatar: UNCATEGORIZED_AVATAR,
            count: 5,
            stale: false,
        });
        expect(options.map((o) => o.value)).toEqual([UNCATEGORIZED_VALUE, "c-rent"]);
    });

    it("sorts the rest alphabetically", () => {
        const options = buildCategories({
            facets: [
                { categoryId: "c-rent", count: 1 },
                { categoryId: "c-fun", count: 1 },
                { categoryId: "c-groceries", count: 1 },
            ],
        });

        expect(options.map((o) => o.label)).toEqual(["Fun", "Groceries", "Rent"]);
    });

    it("gives a selected category with no matches count 0 and stale", () => {
        const options = buildCategories({
            facets: [{ categoryId: "c-rent", count: 2 }],
            selectedIds: ["c-fun"],
        });

        expect(options).toContainEqual({
            value: "c-fun",
            label: "Fun",
            avatar: { kind: "entity", icon: "gamepad-2", color: "#F59E0B", fallback: DEFAULT_CATEGORY_AVATAR_ICON },
            count: 0,
            stale: true,
        });
    });

    it("offers a selected Uncategorized with no matches as stale", () => {
        const options = buildCategories({
            facets: [{ categoryId: "c-rent", count: 2 }],
            selectedIds: [UNCATEGORIZED_VALUE],
        });

        expect(options[0]).toEqual({
            value: UNCATEGORIZED_VALUE,
            label: "Uncategorized",
            avatar: UNCATEGORIZED_AVATAR,
            count: 0,
            stale: true,
        });
    });

    it("ignores a selected id that is not a known category", () => {
        const options = buildCategories({
            facets: [{ categoryId: "c-rent", count: 2 }],
            selectedIds: ["c-deleted"],
        });

        expect(options.map((o) => o.value)).toEqual(["c-rent"]);
    });

    it("drops a facet id that is missing from the categories", () => {
        const options = buildCategories({
            facets: [
                { categoryId: "c-gone", count: 3 },
                { categoryId: "c-rent", count: 2 },
            ],
        });

        expect(options.map((o) => o.value)).toEqual(["c-rent"]);
    });

    it("does not mark a selected category that has matches as stale", () => {
        const options = buildCategories({
            facets: [{ categoryId: "c-rent", count: 2 }],
            selectedIds: ["c-rent"],
        });

        expect(options.map((o) => [o.value, o.count, o.stale])).toEqual([["c-rent", 2, false]]);
    });

    it("falls back to every category, with no counts, when the facet failed", () => {
        const options = buildCategories({ facetFailed: true, facets: undefined });

        expect(options[0]).toEqual({
            value: UNCATEGORIZED_VALUE,
            label: "Uncategorized",
            avatar: UNCATEGORIZED_AVATAR,
            stale: false,
        });
        expect(options.slice(1).map((o) => o.label)).toEqual(["Fun", "Groceries", "Rent"]);
        expect(options.every((o) => o.count === undefined && o.stale === false)).toBe(true);
    });

    it("gives an empty list when the categories are undefined", () => {
        expect(buildCategories({ categories: undefined, facets: [{ categoryId: "c-rent", count: 2 }] })).toEqual([]);
    });

    it("gives an empty list while the facets are still loading", () => {
        expect(buildCategories({ facets: undefined })).toEqual([]);
    });
});

const accounts: AccountFilterOptionsInput["accounts"] = [
    { id: "a-leumi", name: "Leumi checking", icon: null, color: null, type: "bank" },
    { id: "a-visa", name: "Visa", icon: "credit-card", color: "#6366F1", type: "credit_card" },
    { id: "a-cash", name: "Wallet", icon: null, color: null, type: "cash" },
    { id: "a-savings", name: "Apple", icon: null, color: null, type: "savings" },
];

const buildAccounts = (overrides: Partial<AccountFilterOptionsInput> = {}) =>
    buildAccountFilterOptions({
        accounts,
        facets: [],
        facetFailed: false,
        selectedIds: [],
        ...overrides,
    });

describe("buildAccountFilterOptions", () => {
    it("offers only the accounts with rows in the view, with their counts", () => {
        const options = buildAccounts({
            facets: [
                { accountId: "a-visa", count: 3 },
                { accountId: "a-leumi", count: 9 },
            ],
        });

        expect(options).toEqual([
            {
                value: "a-leumi",
                label: "Leumi checking",
                avatar: { kind: "entity", icon: null, color: null, fallback: "landmark" },
                count: 9,
                stale: false,
            },
            {
                value: "a-visa",
                label: "Visa",
                avatar: { kind: "entity", icon: "credit-card", color: "#6366F1", fallback: "credit-card" },
                count: 3,
                stale: false,
            },
        ]);
    });

    it("sorts alphabetically by name, flat", () => {
        const options = buildAccounts({
            facets: [
                { accountId: "a-leumi", count: 1 },
                { accountId: "a-cash", count: 1 },
                { accountId: "a-savings", count: 1 },
                { accountId: "a-visa", count: 1 },
            ],
        });

        expect(options.map((o) => o.label)).toEqual(["Apple", "Leumi checking", "Visa", "Wallet"]);
    });

    it("uses the fallback icon for the account type when the account has none", () => {
        const options = buildAccounts({
            facets: [
                { accountId: "a-cash", count: 1 },
                { accountId: "a-savings", count: 1 },
            ],
        });

        expect(options.map((o) => o.avatar)).toEqual([
            { kind: "entity", icon: null, color: null, fallback: "piggy-bank" },
            { kind: "entity", icon: null, color: null, fallback: "wallet" },
        ]);
    });

    it("gives a selected account with no rows count 0 and stale", () => {
        const options = buildAccounts({
            facets: [{ accountId: "a-visa", count: 3 }],
            selectedIds: ["a-cash"],
        });

        expect(options).toContainEqual({
            value: "a-cash",
            label: "Wallet",
            avatar: { kind: "entity", icon: null, color: null, fallback: "wallet" },
            count: 0,
            stale: true,
        });
    });

    it("ignores a faceted or selected id that is not a known account", () => {
        const options = buildAccounts({
            facets: [
                { accountId: "a-gone", count: 4 },
                { accountId: "a-visa", count: 3 },
            ],
            selectedIds: ["a-deleted"],
        });

        expect(options.map((o) => o.value)).toEqual(["a-visa"]);
    });

    it("offers every account, with no counts, when the facet failed", () => {
        const options = buildAccounts({ facetFailed: true, facets: undefined });

        expect(options.map((o) => o.label)).toEqual(["Apple", "Leumi checking", "Visa", "Wallet"]);
        expect(options.every((o) => o.count === undefined && o.stale === false)).toBe(true);
    });

    it("gives an empty list when the accounts are undefined", () => {
        expect(buildAccounts({ accounts: undefined, facets: [{ accountId: "a-visa", count: 3 }] })).toEqual([]);
    });

    it("gives an empty list while the facets are still loading", () => {
        expect(buildAccounts({ facets: undefined })).toEqual([]);
    });
});

const buildTypes = (overrides: Partial<TypeFilterOptionsInput> = {}) =>
    buildTypeFilterOptions({
        facets: [],
        facetFailed: false,
        selected: [],
        ...overrides,
    });

describe("buildTypeFilterOptions", () => {
    it("offers only the types with rows, in income, expense, transfer order", () => {
        const options = buildTypes({
            facets: [
                { type: "transfer", count: 2 },
                { type: "income", count: 5 },
            ],
        });

        expect(options).toEqual([
            { value: "income", label: "Income", avatar: { kind: "type", type: "income" }, count: 5, stale: false },
            {
                value: "transfer",
                label: "Transfer",
                avatar: { kind: "type", type: "transfer" },
                count: 2,
                stale: false,
            },
        ]);
    });

    it("gives a selected type with no rows count 0 and stale", () => {
        const options = buildTypes({
            facets: [{ type: "expense", count: 4 }],
            selected: ["income"],
        });

        expect(options.map((o) => [o.value, o.count, o.stale])).toEqual([
            ["income", 0, true],
            ["expense", 4, false],
        ]);
    });

    it("does not mark a selected type that has rows as stale", () => {
        const options = buildTypes({
            facets: [{ type: "expense", count: 4 }],
            selected: ["expense"],
        });

        expect(options).toEqual([
            { value: "expense", label: "Expense", avatar: { kind: "type", type: "expense" }, count: 4, stale: false },
        ]);
    });

    it("offers all three types, with no counts, when the facet failed", () => {
        const options = buildTypes({ facetFailed: true, facets: undefined });

        expect(options.map((o) => o.value)).toEqual(["income", "expense", "transfer"]);
        expect(options.every((o) => o.count === undefined && o.stale === false)).toBe(true);
    });

    it("gives an empty list while the facets are still loading", () => {
        expect(buildTypes({ facets: undefined })).toEqual([]);
    });
});

describe("transactionCountLabel", () => {
    it("uses the singular for one transaction", () => {
        expect(transactionCountLabel("Groceries", 1)).toBe("Groceries, 1 transaction");
    });

    it("uses the plural otherwise, including zero", () => {
        expect(transactionCountLabel("Groceries", 14)).toBe("Groceries, 14 transactions");
        expect(transactionCountLabel("Groceries", 0)).toBe("Groceries, 0 transactions");
    });

    it("is just the label when the count is unknown", () => {
        expect(transactionCountLabel("Groceries", undefined)).toBe("Groceries");
    });
});
