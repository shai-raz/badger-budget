import { UNCATEGORIZED_CATEGORY } from "@badger/shared-data";
import type { SpendingReportCategoryItem } from "@badger/types";
import { describe, expect, it } from "vitest";
import { OTHER_COLOR, topCategoriesWithOther } from "./spendingBreakdown";

function category(
    overrides: Partial<SpendingReportCategoryItem> & { categoryId: string | null; amount: number },
): SpendingReportCategoryItem {
    return {
        name: overrides.categoryId ?? "Uncategorized",
        color: "#123456",
        icon: null,
        percentage: 0,
        transactionCount: 1,
        ...overrides,
    };
}

describe("topCategoriesWithOther", () => {
    it("returns all categories as-is when there are 4 or fewer (no Other)", () => {
        const categories = [
            category({ categoryId: "a", amount: 60 }),
            category({ categoryId: "b", amount: 30 }),
            category({ categoryId: "c", amount: 10 }),
        ];

        const slices = topCategoriesWithOther(categories, 100);

        expect(slices).toHaveLength(3);
        expect(slices.map((s) => s.key)).toEqual(["a", "b", "c"]);
        expect(slices.map((s) => s.percentage)).toEqual([60, 30, 10]);
        expect(slices.every((s) => s.color === "#123456")).toBe(true);
    });

    it("folds a single 5th category into an Other slice with its own amount", () => {
        const categories = [
            category({ categoryId: "a", amount: 40 }),
            category({ categoryId: "b", amount: 30 }),
            category({ categoryId: "c", amount: 15 }),
            category({ categoryId: "d", amount: 10 }),
            category({ categoryId: "e", amount: 5 }),
        ];

        const slices = topCategoriesWithOther(categories, 100);

        expect(slices).toHaveLength(5);
        expect(slices.map((s) => s.key)).toEqual(["a", "b", "c", "d", "other"]);
        expect(slices[4]).toMatchObject({ name: "Other", color: OTHER_COLOR, amount: 5, percentage: 5 });
    });

    it("folds everything past the top 4 into an Other slice", () => {
        const categories = [
            category({ categoryId: "a", amount: 20 }),
            category({ categoryId: "b", amount: 18 }),
            category({ categoryId: "c", amount: 16 }),
            category({ categoryId: "d", amount: 14 }),
            category({ categoryId: "e", amount: 12 }),
            category({ categoryId: "f", amount: 10 }),
            category({ categoryId: "g", amount: 6 }),
            category({ categoryId: "h", amount: 4 }),
        ];
        const total = categories.reduce((sum, c) => sum + c.amount, 0);

        const slices = topCategoriesWithOther(categories, total);

        expect(slices).toHaveLength(5);
        expect(slices.map((s) => s.key)).toEqual(["a", "b", "c", "d", "other"]);

        const other = slices[4]!;
        expect(other.name).toBe("Other");
        expect(other.color).toBe(OTHER_COLOR);
        expect(other.amount).toBe(12 + 10 + 6 + 4);

        // Slice amounts sum to the sum of all categories.
        expect(slices.reduce((sum, s) => sum + s.amount, 0)).toBe(total);
    });

    it("returns 0% for every slice when total is 0", () => {
        const categories = [category({ categoryId: "a", amount: 0 }), category({ categoryId: "b", amount: 0 })];

        const slices = topCategoriesWithOther(categories, 0);

        expect(slices.every((s) => s.percentage === 0)).toBe(true);
    });

    it("falls back to the uncategorized color for an unparseable category color", () => {
        const categories = [category({ categoryId: "a", amount: 100, color: "not-a-color" })];

        const slices = topCategoriesWithOther(categories, 100);

        expect(slices[0]!.color).toBe("#9ca3af");
    });

    it("uses a distinct color for Other than Uncategorized", () => {
        expect(OTHER_COLOR.toLowerCase()).not.toBe(UNCATEGORIZED_CATEGORY.color.toLowerCase());
    });
});
