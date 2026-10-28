import type { ComputedRef, MaybeRefOrGetter, Ref, WritableComputedRef } from "vue";
import type { ITransactionListParams, ITransactionSummaryParams } from "@badger/types";
import { useMonthRangeQuery } from "../useMonthRangeQuery";
import { selectionToDateBounds } from "../../utils/monthRange";
import {
    parseTransactionFilters,
    sameTransactionFilters,
    withTransactionFilters,
    type TransactionFilterState,
    type TransactionSortOption,
    type TransactionTypeFilter,
} from "../../utils/transactionFilterQuery";
import { latestQuery, writeQuery, type QueryWrite } from "../../utils/queryHistory";

export type { TransactionSortOption, TransactionTypeFilter } from "../../utils/transactionFilterQuery";

export interface ActiveFilterChip {
    key: string;
    icon: string;
    label: string;
    clear: () => void;
}

export interface UseTransactionFiltersOptions {
    /**
     * Total number of categories available, used for the categories chip's
     * "N of M categories" label. Supply a ref/getter (e.g. from the categories
     * query) so the label stays accurate as categories load. When omitted or 0,
     * the chip falls back to "N categories".
     */
    totalCategoryCount?: MaybeRefOrGetter<number | undefined>;
    /**
     * Ids of the categories the user has, including the Uncategorized pseudo-id. Undefined while they load: no id is
     * dropped then, so the URL is not rewritten before the list is known.
     */
    knownCategoryIds?: MaybeRefOrGetter<string[] | undefined>;
}

const TYPE_CHIP_LABELS: Record<Exclude<TransactionTypeFilter, "all">, string> = {
    income: "Income",
    expense: "Expenses",
    transfer: "Transfers",
};

const SORT_MAP: Record<
    TransactionSortOption,
    { sortBy: ITransactionListParams["sortBy"]; sortOrder: ITransactionListParams["sortOrder"] }
> = {
    newest: { sortBy: "transactionDate", sortOrder: "desc" },
    oldest: { sortBy: "transactionDate", sortOrder: "asc" },
    "amount-desc": { sortBy: "amount", sortOrder: "desc" },
    "amount-asc": { sortBy: "amount", sortOrder: "asc" },
    name: { sortBy: "description", sortOrder: "asc" },
};

/**
 * Page-scoped filter state for the transactions page. The URL query is the single source: search, type, categories,
 * sort and show-hidden are read from `route.query` (see `utils/transactionFilterQuery.ts`), and every control writes
 * back to it. The period is in the URL too (`?from`/`?to`, via `useMonthRangeQuery`). The search input text is local
 * so typing stays responsive; the URL takes its trimmed value after the debounce. Exposes `listParams`/`summaryParams`
 * ready for `useInfiniteTransactions`/`useTransactionsSummary`, plus chip/count helpers.
 */
export function useTransactionFilters(options: UseTransactionFiltersOptions = {}) {
    const route = useRoute();
    const router = useRouter();

    // URL state ----------------------------------------------------------------
    const urlFilters = computed(() => parseTransactionFilters(latestQuery(router, route.query)));

    // Period lives in the URL (?from/?to); a bare page load reads as the current month. Changes push history.
    const { selection: period } = useMonthRangeQuery({ allowAll: true, historyMode: "push" });

    // Writes one filter change, keeping every other query key. Unchanged state writes nothing. The state is built from
    // the latest query, including a write still in flight, so one control's change does not undo another's.
    function writeFilters(next: Partial<TransactionFilterState>, write: QueryWrite) {
        const state: TransactionFilterState = { ...urlFilters.value, ...next };
        if (sameTransactionFilters(state, urlFilters.value)) return;
        writeQuery(router, withTransactionFilters(latestQuery(router, route.query), state), write);
    }

    // Search -------------------------------------------------------------------
    // The input is local so typing never waits on the router. `syncedSearch` is the search text the URL holds as far as
    // this page knows: our own writes and their echoes match it, so only an external change (Back, a pasted link)
    // rewrites the input. The live input can be ahead of the URL while the debounce runs.
    const searchQuery = ref(urlFilters.value.search);
    const debouncedSearch = refDebounced(searchQuery, 300);
    let syncedSearch = urlFilters.value.search;

    watch(
        () => urlFilters.value.search,
        (urlSearch) => {
            if (urlSearch === syncedSearch) return;
            syncedSearch = urlSearch;
            searchQuery.value = urlSearch;
        },
    );

    function commitSearch(text: string, write: QueryWrite) {
        const value = text.trim();
        if (value === syncedSearch) return;
        syncedSearch = value;
        writeFilters({ search: value }, write);
    }

    watch(debouncedSearch, (text) => commitSearch(text, { kind: "edit", control: "search" }));

    // Filters ------------------------------------------------------------------
    const typeFilter = computed<TransactionTypeFilter>({
        get: () => urlFilters.value.type,
        set: (type) => writeFilters({ type }, { kind: "push" }),
    });

    const sortOption = computed<TransactionSortOption>({
        get: () => urlFilters.value.sort,
        set: (sort) => writeFilters({ sort }, { kind: "push" }),
    });

    const showHidden = computed<boolean>({
        get: () => urlFilters.value.showHidden,
        set: (value) => writeFilters({ showHidden: value }, { kind: "push" }),
    });

    // Empty array === all categories (no filter param sent). Ids the user no longer has are ignored once the list has
    // loaded, and a selection of every category reads as none (the same collapse useCategoryToggle writes).
    const selectedCategoryIds: WritableComputedRef<string[]> = computed({
        get: () => {
            const requested = urlFilters.value.categoryIds;
            const known = toValue(options.knownCategoryIds);
            if (!known) return requested;
            const valid = known.filter((id) => requested.includes(id));
            return valid.length === known.length ? [] : valid;
        },
        set: (ids) => writeFilters({ categoryIds: ids }, { kind: "edit", control: "categories" }),
    });

    // Params -------------------------------------------------------------------
    const listParams: ComputedRef<ITransactionListParams> = computed(() => {
        const { startDate, endDate } = selectionToDateBounds(period.value);
        const { sortBy, sortOrder } = SORT_MAP[sortOption.value];

        const params: ITransactionListParams = {
            includeHidden: showHidden.value,
            sortBy,
            sortOrder,
            limit: 50,
        };

        if (startDate) params.startDate = startDate;
        if (endDate) params.endDate = endDate;
        if (urlFilters.value.search) params.search = urlFilters.value.search;
        if (typeFilter.value !== "all") params.type = typeFilter.value;
        if (selectedCategoryIds.value.length > 0) params.categoryIds = [...selectedCategoryIds.value];

        return params;
    });

    const summaryParams: ComputedRef<ITransactionSummaryParams> = computed(() => {
        const { startDate, endDate } = selectionToDateBounds(period.value);

        const params: ITransactionSummaryParams = {};

        if (startDate) params.startDate = startDate;
        if (endDate) params.endDate = endDate;
        if (urlFilters.value.search) params.search = urlFilters.value.search;
        if (typeFilter.value !== "all") params.type = typeFilter.value;
        if (selectedCategoryIds.value.length > 0) params.categoryIds = [...selectedCategoryIds.value];

        return params;
    });

    // Chips & counts ---------------------------------------------------------
    // Search is intentionally NOT counted in the filter badge (product decision).
    const activeFilterCount = computed(
        () =>
            (typeFilter.value !== "all" ? 1 : 0) +
            (selectedCategoryIds.value.length > 0 ? 1 : 0) +
            (showHidden.value ? 1 : 0),
    );

    const activeChips: ComputedRef<ActiveFilterChip[]> = computed(() => {
        const chips: ActiveFilterChip[] = [];

        if (typeFilter.value !== "all") {
            chips.push({
                key: "type",
                icon: "pi-filter",
                label: TYPE_CHIP_LABELS[typeFilter.value],
                clear: () => writeFilters({ type: "all" }, { kind: "push" }),
            });
        }

        if (selectedCategoryIds.value.length > 0) {
            const selected = selectedCategoryIds.value.length;
            const total = toValue(options.totalCategoryCount);
            const label = total && total > 0 ? `${selected} of ${total} categories` : `${selected} categories`;
            chips.push({
                key: "categories",
                icon: "pi-tag",
                label,
                clear: () => writeFilters({ categoryIds: [] }, { kind: "push" }),
            });
        }

        if (showHidden.value) {
            chips.push({
                key: "hidden",
                icon: "pi-eye",
                label: "Showing hidden",
                clear: () => writeFilters({ showHidden: false }, { kind: "push" }),
            });
        }

        if (urlFilters.value.search) {
            chips.push({
                key: "search",
                icon: "pi-search",
                label: `"${urlFilters.value.search}"`,
                clear: () => {
                    searchQuery.value = "";
                    commitSearch("", { kind: "push" });
                },
            });
        }

        return chips;
    });

    const hasActiveFilters = computed(() => activeChips.value.length > 0);

    // Actions ----------------------------------------------------------------
    // Resets filters ONLY — not search, timeframe or sort (product decision).
    function clearAllFilters() {
        writeFilters({ type: "all", categoryIds: [], showHidden: false }, { kind: "push" });
    }

    return {
        // Local state
        searchQuery,
        debouncedSearch: debouncedSearch as Readonly<Ref<string>>,
        typeFilter,
        selectedCategoryIds,
        sortOption,

        // URL-backed period and show-hidden
        period,
        showHidden,

        // Derived params
        listParams,
        summaryParams,

        // Chips & counts
        activeFilterCount,
        activeChips,
        hasActiveFilters,

        // Actions
        clearAllFilters,
    };
}
