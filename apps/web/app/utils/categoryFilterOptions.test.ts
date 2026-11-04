import { describe, expect, it } from "vitest";
import {
    buildCategoryFilterOptions,
    transactionCountLabel,
    UNCATEGORIZED_COLOR,
    UNCATEGORIZED_VALUE,
    type CategoryFilterOptionsInput,
} from "./categoryFilterOptions";

const categories: CategoryFilterOptionsInput["categories"] = [
    { id: "c-groceries", name: "Groceries", color: "#10B981" },
    { id: "c-rent", name: "Rent", color: "#3B82F6" },
    { id: "c-fun", name: "Fun", color: "#F59E0B" },
];

const build = (overrides: Partial<CategoryFilterOptionsInput> = {}) =>
    buildCategoryFilterOptions({
        categories,
        facets: [],
        facetFailed: false,
        selectedIds: [],
        ...overrides,
    });

describe("buildCategoryFilterOptions", () => {
    it("offers only the facet categories, with their counts", () => {
        const options = build({
            facets: [
                { categoryId: "c-rent", count: 2 },
                { categoryId: "c-groceries", count: 14 },
            ],
        });

        expect(options).toEqual([
            { value: "c-groceries", label: "Groceries", color: "#10B981", count: 14, stale: false },
            { value: "c-rent", label: "Rent", color: "#3B82F6", count: 2, stale: false },
        ]);
    });

    it("maps a null facet to Uncategorized, which comes first", () => {
        const options = build({
            facets: [
                { categoryId: "c-rent", count: 2 },
                { categoryId: null, count: 5 },
            ],
        });

        expect(options[0]).toEqual({
            value: UNCATEGORIZED_VALUE,
            label: "Uncategorized",
            color: UNCATEGORIZED_COLOR,
            count: 5,
            stale: false,
        });
        expect(options.map((o) => o.value)).toEqual([UNCATEGORIZED_VALUE, "c-rent"]);
    });

    it("sorts the rest alphabetically", () => {
        const options = build({
            facets: [
                { categoryId: "c-rent", count: 1 },
                { categoryId: "c-fun", count: 1 },
                { categoryId: "c-groceries", count: 1 },
            ],
        });

        expect(options.map((o) => o.label)).toEqual(["Fun", "Groceries", "Rent"]);
    });

    it("gives a selected category with no matches count 0 and stale", () => {
        const options = build({
            facets: [{ categoryId: "c-rent", count: 2 }],
            selectedIds: ["c-fun"],
        });

        expect(options).toContainEqual({
            value: "c-fun",
            label: "Fun",
            color: "#F59E0B",
            count: 0,
            stale: true,
        });
    });

    it("offers a selected Uncategorized with no matches as stale", () => {
        const options = build({
            facets: [{ categoryId: "c-rent", count: 2 }],
            selectedIds: [UNCATEGORIZED_VALUE],
        });

        expect(options[0]).toEqual({
            value: UNCATEGORIZED_VALUE,
            label: "Uncategorized",
            color: UNCATEGORIZED_COLOR,
            count: 0,
            stale: true,
        });
    });

    it("ignores a selected id that is not a known category", () => {
        const options = build({
            facets: [{ categoryId: "c-rent", count: 2 }],
            selectedIds: ["c-deleted"],
        });

        expect(options.map((o) => o.value)).toEqual(["c-rent"]);
    });

    it("drops a facet id that is missing from the categories", () => {
        const options = build({
            facets: [
                { categoryId: "c-gone", count: 3 },
                { categoryId: "c-rent", count: 2 },
            ],
        });

        expect(options.map((o) => o.value)).toEqual(["c-rent"]);
    });

    it("does not mark a selected category that has matches as stale", () => {
        const options = build({
            facets: [{ categoryId: "c-rent", count: 2 }],
            selectedIds: ["c-rent"],
        });

        expect(options).toEqual([{ value: "c-rent", label: "Rent", color: "#3B82F6", count: 2, stale: false }]);
    });

    it("falls back to every category, with no counts, when the facet failed", () => {
        const options = build({ facetFailed: true, facets: undefined });

        expect(options[0]).toEqual({
            value: UNCATEGORIZED_VALUE,
            label: "Uncategorized",
            color: UNCATEGORIZED_COLOR,
            stale: false,
        });
        expect(options.slice(1).map((o) => o.label)).toEqual(["Fun", "Groceries", "Rent"]);
        expect(options.every((o) => o.count === undefined && o.stale === false)).toBe(true);
    });

    it("gives an empty list when the categories are undefined", () => {
        expect(build({ categories: undefined, facets: [{ categoryId: "c-rent", count: 2 }] })).toEqual([]);
    });

    it("gives an empty list while the facets are still loading", () => {
        expect(build({ facets: undefined })).toEqual([]);
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
