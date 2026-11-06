import type { ComputedRef, MaybeRefOrGetter, Ref, WritableComputedRef } from "vue";
import type {
    ITransactionAccountFacetParams,
    ITransactionCategoryFacetParams,
    ITransactionListParams,
    ITransactionSummaryParams,
    ITransactionTypeFacetParams,
} from "@badger/types";
import { TRANSACTION_TYPE_LABELS, TRANSACTION_TYPES, type TransactionType } from "@badger/shared-data";
import { useMonthRangeQuery } from "../useMonthRangeQuery";
import { currentMonthSelection, isCurrentMonthSelection, selectionToDateBounds } from "../../utils/monthRange";
import {
    parseTransactionFilters,
    sameTransactionFilters,
    withTransactionFilters,
    type TransactionFilterState,
    type TransactionSortOption,
} from "../../utils/transactionFilterQuery";
import { latestQuery, writeQuery, type QueryWrite } from "../../utils/queryHistory";

export type { TransactionSortOption } from "../../utils/transactionFilterQuery";

export interface ActiveFilterChip {
    key: string;
    icon: string;
    label: string;
    clear: () => void;
}

export interface UseTransactionFiltersOptions {
    /**
     * Ids of the categories the user has, including the Uncategorized pseudo-id. Undefined while they load: no id is
     * dropped then, so the URL is not rewritten before the list is known.
     */
    knownCategoryIds?: MaybeRefOrGetter<string[] | undefined>;
    /** Ids of the accounts the user has. Same semantics as `knownCategoryIds`. */
    knownAccountIds?: MaybeRefOrGetter<string[] | undefined>;
}

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
 * A requested id selection pruned to the known ids. Undefined `known` (still loading) keeps every requested id. A
 * selection of every known id reads as none, the same collapse the toggle composables write.
 */
function prunedSelection(requested: string[], known: string[] | undefined): string[] {
    if (!known) return requested;
    const valid = known.filter((id) => requested.includes(id));
    return valid.length === known.length ? [] : valid;
}

/**
 * Page-scoped filter state for the transactions page. The URL query is the single source: search, types, accounts,
 * categories, sort and show-hidden are read from `route.query` (see `utils/transactionFilterQuery.ts`), and every
 * control writes back to it. The period is in the URL too (`?from`/`?to`, via `useMonthRangeQuery`). The search input
 * text is local so typing stays responsive; the URL takes its trimmed value after the debounce. Exposes
 * `listParams`/`summaryParams` ready for `useInfiniteTransactions`/`useTransactionsSummary`, the per-facet params, plus
 * chip/count helpers.
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
    // Empty array === all types. A selection of every type reads as none, the same collapse as categories.
    const selectedTypes: WritableComputedRef<TransactionType[]> = computed({
        get: () => (urlFilters.value.types.length === TRANSACTION_TYPES.length ? [] : urlFilters.value.types),
        set: (types) => writeFilters({ types }, { kind: "edit", control: "types" }),
    });

    const sortOption = computed<TransactionSortOption>({
        get: () => urlFilters.value.sort,
        set: (sort) => writeFilters({ sort }, { kind: "push" }),
    });

    const showHidden = computed<boolean>({
        get: () => urlFilters.value.showHidden,
        set: (value) => writeFilters({ showHidden: value }, { kind: "push" }),
    });

    // Empty array === all accounts (no filter param sent). Ids the user no longer has are ignored once the list has
    // loaded, and a selection of every account reads as none.
    const selectedAccountIds: WritableComputedRef<string[]> = computed({
        get: () => prunedSelection(urlFilters.value.accountIds, toValue(options.knownAccountIds)),
        set: (ids) => writeFilters({ accountIds: ids }, { kind: "edit", control: "accounts" }),
    });

    // Empty array === all categories (no filter param sent). Ids the user no longer has are ignored once the list has
    // loaded, and a selection of every category reads as none (the same collapse useFilterToggle writes).
    const selectedCategoryIds: WritableComputedRef<string[]> = computed({
        get: () => prunedSelection(urlFilters.value.categoryIds, toValue(options.knownCategoryIds)),
        set: (ids) => writeFilters({ categoryIds: ids }, { kind: "edit", control: "categories" }),
    });

    const isDefaultPeriod = computed(() => isCurrentMonthSelection(period.value, new Date()));

    // Resets the period to this month. It is a plain push, so Back returns to the previous period.
    function resetPeriod() {
        period.value = currentMonthSelection(new Date());
    }

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
        if (selectedTypes.value.length > 0) params.types = [...selectedTypes.value];
        if (selectedAccountIds.value.length > 0) params.accountIds = [...selectedAccountIds.value];
        if (selectedCategoryIds.value.length > 0) params.categoryIds = [...selectedCategoryIds.value];

        return params;
    });

    const summaryParams: ComputedRef<ITransactionSummaryParams> = computed(() => {
        const { startDate, endDate } = selectionToDateBounds(period.value);

        const params: ITransactionSummaryParams = {};

        if (startDate) params.startDate = startDate;
        if (endDate) params.endDate = endDate;
        if (urlFilters.value.search) params.search = urlFilters.value.search;
        if (selectedTypes.value.length > 0) params.types = [...selectedTypes.value];
        if (selectedAccountIds.value.length > 0) params.accountIds = [...selectedAccountIds.value];
        if (selectedCategoryIds.value.length > 0) params.categoryIds = [...selectedCategoryIds.value];

        return params;
    });

    // The facet params share the period, search and show-hidden filters. Each facet omits only its own selection, so its
    // counts stay put while it is edited: every option stays offered while one is picked.
    function sharedFacetParams() {
        const { startDate, endDate } = selectionToDateBounds(period.value);

        const params: Pick<ITransactionListParams, "includeHidden" | "startDate" | "endDate" | "search"> = {
            includeHidden: showHidden.value,
        };

        if (startDate) params.startDate = startDate;
        if (endDate) params.endDate = endDate;
        if (urlFilters.value.search) params.search = urlFilters.value.search;

        return params;
    }

    const categoryFacetParams: ComputedRef<ITransactionCategoryFacetParams> = computed(() => {
        const params: ITransactionCategoryFacetParams = sharedFacetParams();
        if (selectedTypes.value.length > 0) params.types = [...selectedTypes.value];
        if (selectedAccountIds.value.length > 0) params.accountIds = [...selectedAccountIds.value];
        return params;
    });

    const accountFacetParams: ComputedRef<ITransactionAccountFacetParams> = computed(() => {
        const params: ITransactionAccountFacetParams = sharedFacetParams();
        if (selectedTypes.value.length > 0) params.types = [...selectedTypes.value];
        if (selectedCategoryIds.value.length > 0) params.categoryIds = [...selectedCategoryIds.value];
        return params;
    });

    const typeFacetParams: ComputedRef<ITransactionTypeFacetParams> = computed(() => {
        const params: ITransactionTypeFacetParams = sharedFacetParams();
        if (selectedAccountIds.value.length > 0) params.accountIds = [...selectedAccountIds.value];
        if (selectedCategoryIds.value.length > 0) params.categoryIds = [...selectedCategoryIds.value];
        return params;
    });

    // Chips & counts ---------------------------------------------------------
    // The drawer count covers the selections and show-hidden. Search is intentionally NOT counted (product decision),
    // and the period counts only when it is not this month.
    const drawerFilterCount = computed(
        () =>
            (selectedTypes.value.length > 0 ? 1 : 0) +
            (selectedAccountIds.value.length > 0 ? 1 : 0) +
            (selectedCategoryIds.value.length > 0 ? 1 : 0) +
            (showHidden.value ? 1 : 0),
    );

    const activeFilterCount = computed(() => drawerFilterCount.value + (isDefaultPeriod.value ? 0 : 1));

    const activeChips: ComputedRef<ActiveFilterChip[]> = computed(() => {
        const chips: ActiveFilterChip[] = [];

        if (selectedTypes.value.length > 0) {
            chips.push({
                key: "type",
                icon: "pi-filter",
                label: selectedTypes.value.map((type) => TRANSACTION_TYPE_LABELS[type]).join(" + "),
                clear: () => writeFilters({ types: [] }, { kind: "push" }),
            });
        }

        if (selectedAccountIds.value.length > 0) {
            const selected = selectedAccountIds.value.length;
            chips.push({
                key: "accounts",
                icon: "pi-wallet",
                label: selected === 1 ? "1 account" : `${selected} accounts`,
                clear: () => writeFilters({ accountIds: [] }, { kind: "push" }),
            });
        }

        if (selectedCategoryIds.value.length > 0) {
            const selected = selectedCategoryIds.value.length;
            chips.push({
                key: "categories",
                icon: "pi-tag",
                label: selected === 1 ? "1 category" : `${selected} categories`,
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
    // Resets the drawer filters and the period, as one history entry. Search and sort are kept (product decision).
    function clearAllFilters() {
        const state: TransactionFilterState = {
            ...urlFilters.value,
            types: [],
            accountIds: [],
            categoryIds: [],
            showHidden: false,
        };
        writeQuery(router, withTransactionFilters(latestQuery(router, route.query), state, { resetPeriod: true }), {
            kind: "push",
        });
    }

    return {
        // Local state
        searchQuery,
        debouncedSearch: debouncedSearch as Readonly<Ref<string>>,
        selectedTypes,
        selectedAccountIds,
        selectedCategoryIds,
        sortOption,

        // URL-backed period and show-hidden
        period,
        isDefaultPeriod,
        resetPeriod,
        showHidden,

        // Derived params
        listParams,
        summaryParams,
        categoryFacetParams,
        accountFacetParams,
        typeFacetParams,

        // Chips & counts
        drawerFilterCount,
        activeFilterCount,
        activeChips,
        hasActiveFilters,

        // Actions
        clearAllFilters,
    };
}
