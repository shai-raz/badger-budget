import { UNCATEGORIZED_CATEGORY } from "@badger/shared-data";
import type { SpendingReportCategoryItem } from "@badger/types";
import { noirTheme } from "../theme/themes";
import { normalizeHex } from "./color";

export interface DonutSlice {
    key: string;
    name: string;
    color: string;
    amount: number;
    percentage: number;
}

// surface-300 — the default for the synthetic "Other" bucket, which has no category color of its own.
// Deliberately distinct from UNCATEGORIZED_CATEGORY.color (also the util's own unparseable-color
// fallback) so the two gray slices/legend dots stay tellable apart.
export const OTHER_COLOR = noirTheme.surface[300];

/**
 * Collapse a spending report's categories (already sorted by amount desc)
 * into at most `topN + 1` donut slices, folding anything past `topN` into a
 * single "Other" slice. Percentages are whole-number shares of `total`
 * (0 when `total` is 0); slice amounts always sum to the sum of all
 * `categories`, since "Other" is the exact remainder, not a recomputation.
 * `otherColor` paints the "Other" slice; it defaults to OTHER_COLOR.
 */
export function topCategoriesWithOther(
    categories: SpendingReportCategoryItem[],
    total: number,
    topN = 4,
    otherColor = OTHER_COLOR,
): DonutSlice[] {
    const toPercentage = (amount: number) => (total === 0 ? 0 : Math.round((amount / total) * 100));

    const top = categories.slice(0, topN).map(
        (category): DonutSlice => ({
            key: category.categoryId ?? "uncategorized",
            name: category.name,
            color: normalizeHex(category.color) ?? UNCATEGORIZED_CATEGORY.color,
            amount: category.amount,
            percentage: toPercentage(category.amount),
        }),
    );

    const rest = categories.slice(topN);
    if (rest.length === 0) {
        return top;
    }

    const otherAmount = rest.reduce((sum, category) => sum + category.amount, 0);
    return [
        ...top,
        {
            key: "other",
            name: "Other",
            color: otherColor,
            amount: otherAmount,
            percentage: toPercentage(otherAmount),
        },
    ];
}
