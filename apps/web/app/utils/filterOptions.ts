import {
    DEFAULT_CATEGORY_AVATAR_ICON,
    TRANSACTION_TYPE_LABELS,
    TRANSACTION_TYPES,
    type AvatarIconName,
    type TransactionType,
} from "@badger/shared-data";
import type {
    IAccountResponse,
    ITransactionAccountFacet,
    ITransactionCategoryFacet,
    ITransactionTypeFacet,
} from "@badger/types";
import { accountFallbackIcon } from "./avatarIcons";

export const UNCATEGORIZED_VALUE = "uncategorized";
// Kept as hex: FiltersPanel's chipStyle parses it with hexToRgba, which a var() would break.
export const UNCATEGORIZED_COLOR = "#9CA3AF";

const UNCATEGORIZED_LABEL = "Uncategorized";
const UNCATEGORIZED_FALLBACK_ICON: AvatarIconName = "circle-help";

/** What a filter option is drawn with: a stored entity's icon and colour, or a transaction type's glyph. */
export type FilterOptionAvatar =
    | { kind: "entity"; icon: string | null; color: string | null; fallback: AvatarIconName }
    | { kind: "type"; type: TransactionType };

export interface FilterOption<T extends string = string> {
    value: T;
    label: string;
    avatar: FilterOptionAvatar;
    /** Matching transactions in the current view; undefined when counts are unavailable (facet failed). */
    count?: number;
    /** Selected but with no matches in the current view (rendered dimmed). */
    stale: boolean;
}

/** An option before the view's counts are applied. */
type FilterOptionBase<T extends string> = Omit<FilterOption<T>, "count" | "stale">;

/** One value's row count in the current view. */
interface FacetCount<T extends string> {
    value: T;
    count: number;
}

export interface CategoryFilterOptionsInput {
    categories: readonly { id: string; name: string; icon: string | null; color: string }[] | undefined;
    facets: readonly ITransactionCategoryFacet[] | undefined;
    facetFailed: boolean;
    selectedIds: readonly string[];
}

export interface AccountFilterOptionsInput {
    accounts: readonly Pick<IAccountResponse, "id" | "name" | "icon" | "color" | "type">[] | undefined;
    facets: readonly ITransactionAccountFacet[] | undefined;
    facetFailed: boolean;
    selectedIds: readonly string[];
}

export interface TypeFilterOptionsInput {
    facets: readonly ITransactionTypeFacet[] | undefined;
    facetFailed: boolean;
    selected: readonly TransactionType[];
}

/**
 * The category filter's options for the current view. Only categories with rows in the view are offered (plus any
 * selected one, dimmed as stale). A single offered option collapses to "all" on tap; that is accepted, because every
 * row in the view already is that category.
 */
export function buildCategoryFilterOptions(input: CategoryFilterOptionsInput): FilterOption[] {
    const { categories, facets, facetFailed, selectedIds } = input;
    if (!categories) return [];

    const universe: FilterOptionBase<string>[] = [
        { value: UNCATEGORIZED_VALUE, label: UNCATEGORIZED_LABEL, avatar: uncategorizedAvatar() },
        ...categories.map((category) => ({
            value: category.id,
            label: category.name,
            avatar: {
                kind: "entity" as const,
                icon: category.icon,
                color: category.color,
                fallback: DEFAULT_CATEGORY_AVATAR_ICON,
            },
        })),
    ];
    const facetCounts = facets?.map((facet) => ({
        value: facet.categoryId ?? UNCATEGORIZED_VALUE,
        count: facet.count,
    }));

    return offerOptions(universe, facetCounts, facetFailed, selectedIds).sort((a, b) => {
        // Uncategorized first, then the rest alphabetically.
        if (a.value === UNCATEGORIZED_VALUE) return -1;
        if (b.value === UNCATEGORIZED_VALUE) return 1;
        return a.label.localeCompare(b.label);
    });
}

/**
 * The account filter's options for the current view: flat, alphabetical by name. Same offering rules as the categories:
 * accounts with rows in the view, plus selected ones with none (stale).
 */
export function buildAccountFilterOptions(input: AccountFilterOptionsInput): FilterOption[] {
    const { accounts, facets, facetFailed, selectedIds } = input;
    if (!accounts) return [];

    const universe: FilterOptionBase<string>[] = accounts.map((account) => ({
        value: account.id,
        label: account.name,
        avatar: {
            kind: "entity" as const,
            icon: account.icon,
            color: account.color,
            fallback: accountFallbackIcon(account.type),
        },
    }));
    const facetCounts = facets?.map((facet) => ({ value: facet.accountId, count: facet.count }));

    return offerOptions(universe, facetCounts, facetFailed, selectedIds).sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * The type filter's options: income, expense and transfer in that order, each offered when it has rows in the view or
 * is selected (stale). Without counts, all three are offered.
 */
export function buildTypeFilterOptions(input: TypeFilterOptionsInput): FilterOption<TransactionType>[] {
    const { facets, facetFailed, selected } = input;

    const universe: FilterOptionBase<TransactionType>[] = TRANSACTION_TYPES.map((type) => ({
        value: type,
        label: TRANSACTION_TYPE_LABELS[type],
        avatar: { kind: "type" as const, type },
    }));
    const facetCounts = facets?.map((facet) => ({ value: facet.type, count: facet.count }));

    return offerOptions(universe, facetCounts, facetFailed, selected).sort(
        (a, b) => TRANSACTION_TYPES.indexOf(a.value) - TRANSACTION_TYPES.indexOf(b.value),
    );
}

/** "Groceries, 14 transactions", "Groceries, 1 transaction", or just the label when the count is unknown. */
export function transactionCountLabel(label: string, count: number | undefined): string {
    if (count === undefined) return label;
    return `${label}, ${count} ${count === 1 ? "transaction" : "transactions"}`;
}

/**
 * The shared offering rule for every filter. With counts: each value with rows in the view, then each selected value
 * with none (count 0, stale). Values missing from `universe` cannot be labelled, so they are dropped. With the counts
 * failed: the whole universe, with no counts. Empty while the counts are still loading.
 */
function offerOptions<T extends string>(
    universe: readonly FilterOptionBase<T>[],
    facets: readonly FacetCount<T>[] | undefined,
    facetFailed: boolean,
    selected: readonly T[],
): FilterOption<T>[] {
    if (facetFailed) return universe.map((option) => ({ ...option, stale: false }));
    if (!facets) return [];

    const byValue = new Map(universe.map((option) => [option.value, option]));
    const options: FilterOption<T>[] = [];
    const offered = new Set<T>();

    for (const facet of facets) {
        const option = byValue.get(facet.value);
        if (!option || offered.has(facet.value) || facet.count <= 0) continue;

        options.push({ ...option, count: facet.count, stale: false });
        offered.add(facet.value);
    }

    // A selected value with no rows in the view stays visible (dimmed) so it can still be cleared.
    for (const value of selected) {
        const option = byValue.get(value);
        if (!option || offered.has(value)) continue;

        options.push({ ...option, count: 0, stale: true });
        offered.add(value);
    }

    return options;
}

function uncategorizedAvatar(): FilterOptionAvatar {
    return { kind: "entity", icon: null, color: UNCATEGORIZED_COLOR, fallback: UNCATEGORIZED_FALLBACK_ICON };
}
