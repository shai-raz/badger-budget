/**
 * The transactions list's filter state, kept in the URL query. Defaults are omitted, so a bare `/transactions` stays
 * clean. Reading is forgiving: an unknown or malformed value reads as its default, and reading never writes the URL.
 */
import type { LocationQueryRaw } from "vue-router";

export type TransactionTypeFilter = "all" | "income" | "expense" | "transfer";
export type TransactionSortOption = "newest" | "oldest" | "amount-desc" | "amount-asc" | "name";

export interface TransactionFilterState {
    /** Trimmed search text. Empty means no search. */
    search: string;
    type: TransactionTypeFilter;
    /** Empty means all categories. */
    categoryIds: string[];
    sort: TransactionSortOption;
    showHidden: boolean;
}

export const DEFAULT_TRANSACTION_FILTERS: TransactionFilterState = {
    search: "",
    type: "all",
    categoryIds: [],
    sort: "newest",
    showHidden: false,
};

/** Every query key this state owns. Filter writes replace these and leave all other keys alone. */
export const TRANSACTION_FILTER_KEYS = ["sort", "q", "type", "categories", "hidden"] as const;

const TYPE_FILTERS: readonly TransactionTypeFilter[] = ["all", "income", "expense", "transfer"];
const SORT_OPTIONS: readonly TransactionSortOption[] = ["newest", "oldest", "amount-desc", "amount-asc", "name"];

/** The first value of a query key, or undefined when it is absent or not a string (a repeated key takes its first). */
function firstString(value: unknown): string | undefined {
    const first = Array.isArray(value) ? value[0] : value;
    return typeof first === "string" ? first : undefined;
}

function oneOf<T extends string>(options: readonly T[], value: unknown, fallback: T): T {
    const candidate = firstString(value);
    return options.find((option) => option === candidate) ?? fallback;
}

/** Comma-separated ids. Blank entries are dropped and repeats collapse to one. */
function parseCategoryIds(value: unknown): string[] {
    const raw = Array.isArray(value)
        ? value.filter((entry): entry is string => typeof entry === "string").join(",")
        : firstString(value);
    if (!raw) return [];
    const ids = raw
        .split(",")
        .map((id) => id.trim())
        .filter((id) => id.length > 0);
    return [...new Set(ids)];
}

/** Reads the filter state from a route query. Unknown or malformed values fall back to their defaults. */
export function parseTransactionFilters(query: Readonly<Record<string, unknown>>): TransactionFilterState {
    return {
        search: (firstString(query.q) ?? "").trim(),
        type: oneOf(TYPE_FILTERS, query.type, DEFAULT_TRANSACTION_FILTERS.type),
        categoryIds: parseCategoryIds(query.categories),
        sort: oneOf(SORT_OPTIONS, query.sort, DEFAULT_TRANSACTION_FILTERS.sort),
        showHidden: firstString(query.hidden) === "1",
    };
}

/** The query params for a filter state. Only non-default values appear. */
export function serializeTransactionFilters(state: TransactionFilterState): Record<string, string> {
    const params: Record<string, string> = {};
    if (state.sort !== DEFAULT_TRANSACTION_FILTERS.sort) params.sort = state.sort;
    if (state.search !== "") params.q = state.search;
    if (state.type !== DEFAULT_TRANSACTION_FILTERS.type) params.type = state.type;
    if (state.categoryIds.length > 0) params.categories = state.categoryIds.join(",");
    if (state.showHidden) params.hidden = "1";
    return params;
}

/** `query` with the filter keys replaced by `state`'s. Every other key (period, deep-link keys, future keys) is kept. */
export function withTransactionFilters(query: LocationQueryRaw, state: TransactionFilterState): LocationQueryRaw {
    const owned: readonly string[] = TRANSACTION_FILTER_KEYS;
    const kept = Object.entries(query).filter(([key]) => !owned.includes(key));
    return { ...Object.fromEntries(kept), ...serializeTransactionFilters(state) };
}

/** Whether two filter states would produce the same URL. */
export function sameTransactionFilters(a: TransactionFilterState, b: TransactionFilterState): boolean {
    return JSON.stringify(serializeTransactionFilters(a)) === JSON.stringify(serializeTransactionFilters(b));
}
