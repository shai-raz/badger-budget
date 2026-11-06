/**
 * The transactions list's filter state, kept in the URL query. Defaults are omitted, so a bare `/transactions` stays
 * clean. Reading is forgiving: an unknown or malformed value reads as its default, and reading never writes the URL.
 */
import type { LocationQueryRaw, RouteLocationRaw } from "vue-router";
import { isTransactionType, TRANSACTION_TYPES, type TransactionType } from "@badger/shared-data";

export type TransactionSortOption = "newest" | "oldest" | "amount-desc" | "amount-asc" | "name";

export interface TransactionFilterState {
    /** Trimmed search text. Empty means no search. */
    search: string;
    /** Canonical order (`TRANSACTION_TYPES`). Empty means all types. */
    types: TransactionType[];
    /** Empty means all accounts. */
    accountIds: string[];
    /** Empty means all categories. */
    categoryIds: string[];
    sort: TransactionSortOption;
    showHidden: boolean;
}

export const DEFAULT_TRANSACTION_FILTERS: TransactionFilterState = {
    search: "",
    types: [],
    accountIds: [],
    categoryIds: [],
    sort: "newest",
    showHidden: false,
};

/**
 * Every query key this state owns. Filter writes replace these and leave all other keys alone. `type` is the retired
 * single-type key, owned only so the next write drops it; it is never read.
 */
export const TRANSACTION_FILTER_KEYS = ["sort", "q", "types", "accounts", "categories", "hidden", "type"] as const;

/** The period keys. `withTransactionFilters` drops them on `resetPeriod`, so a bare URL reads as this month. */
const PERIOD_KEYS = ["from", "to"] as const;

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
function parseIdList(value: unknown): string[] {
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

/** Transaction types in canonical order. Unknown values are dropped and repeats collapse to one. */
function parseTypes(value: unknown): TransactionType[] {
    const requested = parseIdList(value).filter(isTransactionType);
    return TRANSACTION_TYPES.filter((type) => requested.includes(type));
}

/** Reads the filter state from a route query. Unknown or malformed values fall back to their defaults. */
export function parseTransactionFilters(query: Readonly<Record<string, unknown>>): TransactionFilterState {
    return {
        search: (firstString(query.q) ?? "").trim(),
        types: parseTypes(query.types),
        accountIds: parseIdList(query.accounts),
        categoryIds: parseIdList(query.categories),
        sort: oneOf(SORT_OPTIONS, query.sort, DEFAULT_TRANSACTION_FILTERS.sort),
        showHidden: firstString(query.hidden) === "1",
    };
}

/** The query params for a filter state. Only non-default values appear. */
export function serializeTransactionFilters(state: TransactionFilterState): Record<string, string> {
    const params: Record<string, string> = {};
    if (state.sort !== DEFAULT_TRANSACTION_FILTERS.sort) params.sort = state.sort;
    if (state.search !== "") params.q = state.search;
    if (state.types.length > 0) params.types = state.types.join(",");
    if (state.accountIds.length > 0) params.accounts = state.accountIds.join(",");
    if (state.categoryIds.length > 0) params.categories = state.categoryIds.join(",");
    if (state.showHidden) params.hidden = "1";
    return params;
}

/**
 * `query` with the filter keys replaced by `state`'s. Every other key (period, deep-link keys, future keys) is kept.
 * `resetPeriod` also drops the period keys.
 */
export function withTransactionFilters(
    query: LocationQueryRaw,
    state: TransactionFilterState,
    options: { resetPeriod?: boolean } = {},
): LocationQueryRaw {
    const owned: readonly string[] = options.resetPeriod
        ? [...TRANSACTION_FILTER_KEYS, ...PERIOD_KEYS]
        : TRANSACTION_FILTER_KEYS;
    const kept = Object.entries(query).filter(([key]) => !owned.includes(key));
    return { ...Object.fromEntries(kept), ...serializeTransactionFilters(state) };
}

/**
 * The transactions list filtered to one account. No period keys, so the list opens on this month. An account tile or
 * row links here.
 */
export function accountTransactionsLink(accountId: string): RouteLocationRaw {
    return { path: "/transactions", query: { accounts: accountId } };
}

/** Whether two filter states would produce the same URL. */
export function sameTransactionFilters(a: TransactionFilterState, b: TransactionFilterState): boolean {
    return JSON.stringify(serializeTransactionFilters(a)) === JSON.stringify(serializeTransactionFilters(b));
}
