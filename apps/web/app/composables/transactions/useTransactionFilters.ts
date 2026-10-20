import type { ComputedRef, MaybeRefOrGetter, Ref } from "vue";
import type { ITransactionListParams, ITransactionSummaryParams } from "@badger/types";
import { useTransactionsStore } from "../../stores/transactions";

export type TransactionTypeFilter = "all" | "income" | "expense" | "transfer";
export type TransactionSortOption = "newest" | "oldest" | "amount-desc" | "amount-asc" | "name";

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

/** Last day of a 1-based month, e.g. lastDayOfMonth(2026, 2) === 28. */
function lastDayOfMonth(year: number, month: number): number {
    return new Date(year, month, 0).getDate();
}

/**
 * Convert a YYYY-MM range to inclusive YYYY-MM-DD bounds by building the
 * strings directly — never `Date.toISOString()`, which would shift the day
 * across timezones.
 */
function rangeToDateBounds(from: string, to: string): { startDate?: string; endDate?: string } {
    if (!from || !to) return {};

    const [fromYear, fromMonth] = from.split("-").map(Number);
    const [toYear, toMonth] = to.split("-").map(Number);
    if (!fromYear || !fromMonth || !toYear || !toMonth) return {};

    const endDay = lastDayOfMonth(toYear, toMonth);
    return {
        startDate: `${from}-01`,
        endDate: `${to}-${String(endDay).padStart(2, "0")}`,
    };
}

/**
 * Page-scoped filter state for the redesigned transactions page. Owns the local
 * filter refs (search/type/categories/sort) and bridges the Pinia transactions
 * store for the shared `selectedMonthRange` and `showHidden` state (read/write,
 * never duplicated). Exposes `listParams`/`summaryParams` ready for
 * `useInfiniteTransactions`/`useTransactionsSummary`, plus chip/count helpers.
 */
export function useTransactionFilters(options: UseTransactionFiltersOptions = {}) {
    const store = useTransactionsStore();

    // Local state ------------------------------------------------------------
    const searchQuery = ref("");
    const debouncedSearch = refDebounced(searchQuery, 300);
    const typeFilter = ref<TransactionTypeFilter>("all");
    // Empty array === all categories (no filter param sent).
    const selectedCategoryIds = ref<string[]>([]);
    const sortOption = ref<TransactionSortOption>("newest");

    // Store bridge (do NOT duplicate — read/write the store) ------------------
    const selectedMonthRange = computed({
        get: () => store.selectedMonthRange,
        set: (range) => store.setSelectedMonthRange(range),
    });
    const showHidden = computed({
        get: () => store.showHidden,
        set: (value) => store.setShowHidden(value),
    });

    const trimmedSearch = computed(() => debouncedSearch.value.trim());

    // Params -----------------------------------------------------------------
    const listParams: ComputedRef<ITransactionListParams> = computed(() => {
        const { from, to } = store.selectedMonthRange;
        const { startDate, endDate } = rangeToDateBounds(from, to);
        const { sortBy, sortOrder } = SORT_MAP[sortOption.value];

        const params: ITransactionListParams = {
            includeHidden: store.showHidden,
            sortBy,
            sortOrder,
            limit: 50,
        };

        if (startDate) params.startDate = startDate;
        if (endDate) params.endDate = endDate;
        if (trimmedSearch.value) params.search = trimmedSearch.value;
        if (typeFilter.value !== "all") params.type = typeFilter.value;
        if (selectedCategoryIds.value.length > 0) params.categoryIds = [...selectedCategoryIds.value];

        return params;
    });

    const summaryParams: ComputedRef<ITransactionSummaryParams> = computed(() => {
        const { from, to } = store.selectedMonthRange;
        const { startDate, endDate } = rangeToDateBounds(from, to);

        const params: ITransactionSummaryParams = {};

        if (startDate) params.startDate = startDate;
        if (endDate) params.endDate = endDate;
        if (trimmedSearch.value) params.search = trimmedSearch.value;
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
            (store.showHidden ? 1 : 0),
    );

    const activeChips: ComputedRef<ActiveFilterChip[]> = computed(() => {
        const chips: ActiveFilterChip[] = [];

        if (typeFilter.value !== "all") {
            chips.push({
                key: "type",
                icon: "pi-filter",
                label: TYPE_CHIP_LABELS[typeFilter.value],
                clear: () => {
                    typeFilter.value = "all";
                },
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
                clear: () => {
                    selectedCategoryIds.value = [];
                },
            });
        }

        if (store.showHidden) {
            chips.push({
                key: "hidden",
                icon: "pi-eye",
                label: "Showing hidden",
                clear: () => store.setShowHidden(false),
            });
        }

        if (trimmedSearch.value) {
            chips.push({
                key: "search",
                icon: "pi-search",
                label: `"${trimmedSearch.value}"`,
                clear: () => {
                    searchQuery.value = "";
                },
            });
        }

        return chips;
    });

    const hasActiveFilters = computed(() => activeChips.value.length > 0);

    // Actions ----------------------------------------------------------------
    // Resets filters ONLY — not search, timeframe or sort (product decision).
    function clearAllFilters() {
        typeFilter.value = "all";
        selectedCategoryIds.value = [];
        store.setShowHidden(false);
    }

    return {
        // Local state
        searchQuery,
        debouncedSearch: debouncedSearch as Readonly<Ref<string>>,
        typeFilter,
        selectedCategoryIds,
        sortOption,

        // Store-bridged state
        selectedMonthRange,
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
