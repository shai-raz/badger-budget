import type { ITransactionCategoryFacet } from "@badger/types";

export const UNCATEGORIZED_VALUE = "uncategorized";
// Kept as hex: FiltersPanel's chipStyle parses it with hexToRgba, which a var() would break.
export const UNCATEGORIZED_COLOR = "#9CA3AF";

const UNCATEGORIZED_LABEL = "Uncategorized";

export interface CategoryFilterOption {
    value: string;
    label: string;
    /** Category color for the dot (neutral gray for Uncategorized). */
    color: string;
    /** Matching transactions in the current view; undefined when counts are unavailable (facet failed). */
    count?: number;
    /** Selected but with no matches in the current view (rendered dimmed). */
    stale: boolean;
}

export interface CategoryFilterOptionsInput {
    categories: readonly { id: string; name: string; color: string }[] | undefined;
    facets: readonly ITransactionCategoryFacet[] | undefined;
    facetFailed: boolean;
    selectedIds: readonly string[];
}

/**
 * The category filter's options for the current view. Only categories with rows in the view are offered (plus any
 * selected one, dimmed as stale). A single offered option collapses to "all" on tap; that is accepted, because every
 * row in the view already is that category.
 */
export function buildCategoryFilterOptions(input: CategoryFilterOptionsInput): CategoryFilterOption[] {
    const { categories, facets, facetFailed, selectedIds } = input;
    if (!categories) return [];

    const byId = new Map(categories.map((category) => [category.id, category]));
    const options: CategoryFilterOption[] = [];
    const offered = new Set<string>();

    // Counts are unavailable: fall back to every category, as the picker did before the facets.
    if (facetFailed) {
        options.push(uncategorizedOption({ stale: false }));
        for (const category of categories) {
            options.push({ value: category.id, label: category.name, color: category.color, stale: false });
        }
        return sortOptions(options);
    }

    if (!facets) return [];

    for (const facet of facets) {
        const value = facet.categoryId ?? UNCATEGORIZED_VALUE;
        if (offered.has(value)) continue;

        if (value === UNCATEGORIZED_VALUE) {
            options.push(uncategorizedOption({ count: facet.count, stale: false }));
        } else {
            // A facet id with no matching category cannot be labelled, so it is not offered.
            const category = byId.get(value);
            if (!category) continue;
            options.push({ value, label: category.name, color: category.color, count: facet.count, stale: false });
        }
        offered.add(value);
    }

    // A selected category with no rows in the view stays visible (dimmed) so it can still be cleared.
    for (const id of selectedIds) {
        if (offered.has(id)) continue;

        if (id === UNCATEGORIZED_VALUE) {
            options.push(uncategorizedOption({ count: 0, stale: true }));
        } else {
            const category = byId.get(id);
            if (!category) continue;
            options.push({ value: id, label: category.name, color: category.color, count: 0, stale: true });
        }
        offered.add(id);
    }

    return sortOptions(options);
}

/** "Groceries, 14 transactions", "Groceries, 1 transaction", or just the label when the count is unknown. */
export function transactionCountLabel(label: string, count: number | undefined): string {
    if (count === undefined) return label;
    return `${label}, ${count} ${count === 1 ? "transaction" : "transactions"}`;
}

function uncategorizedOption(extra: Pick<CategoryFilterOption, "stale"> & { count?: number }): CategoryFilterOption {
    return { value: UNCATEGORIZED_VALUE, label: UNCATEGORIZED_LABEL, color: UNCATEGORIZED_COLOR, ...extra };
}

// Uncategorized first, then the rest alphabetically.
function sortOptions(options: CategoryFilterOption[]): CategoryFilterOption[] {
    return options.sort((a, b) => {
        if (a.value === UNCATEGORIZED_VALUE) return -1;
        if (b.value === UNCATEGORIZED_VALUE) return 1;
        return a.label.localeCompare(b.label);
    });
}
