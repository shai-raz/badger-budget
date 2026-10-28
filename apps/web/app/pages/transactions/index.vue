<script setup lang="ts">
import type { ICategoryResponse, ITransactionResponse } from "@badger/types";
import { useQueryClient } from "@tanstack/vue-query";
import {
    transactionKeys,
    useInfiniteTransactions,
    useTransactionsSummary,
} from "../../composables/transactions/useTransactions";
import { useTransactionFilters } from "../../composables/transactions/useTransactionFilters";
import { listScrollKey, saveListScroll, takeListScroll } from "../../utils/listScroll";
// Imported explicitly (Nuxt would otherwise auto-import it) so its instance
// type is in scope for the template ref below.
import TransactionsListRows from "../../components/transactions/ListRows.vue";
import type { TransactionFormPrefill } from "../../utils/transactionForm";
import CreateTransactionDialog from "../../components/transactions/CreateTransactionDialog.vue";

// fullBleed: below md the toolbar, metrics strip and list span the full screen
// width and are separated by their own borders, so the layout must not add its
// usual scroller padding. Desktop is unaffected.
definePageMeta({
    layout: "app",
    fullBleed: true,
});

const router = useRouter();

// Category filter options come from the categories endpoint (not derived from
// the loaded rows), plus an "Uncategorized" pseudo-option. The page owns these
// in one place; the filters panel and chips both read from here.
const UNCATEGORIZED_VALUE = "uncategorized";
const UNCATEGORIZED_COLOR = "#9CA3AF"; // neutral gray, matches surface-400

const { data: categoriesData, isPending: isCategoriesPending } = useGetCategoriesQuery();

// Empty while the query is in flight, rather than the lone "Uncategorized"
// pseudo-entry: a single option looks like a full selection to the filter's
// collapse-to-"all" rule, so the first tap would be silently swallowed. An
// empty chip row also reads as "loading" rather than as one broken option.
const categoryOptions = computed(() => {
    if (isCategoriesPending.value) return [];

    const options = ((categoriesData.value ?? []) as ICategoryResponse[])
        .map((category) => ({ value: category.id, label: category.name, color: category.color }))
        .sort((left, right) => left.label.localeCompare(right.label));

    return [{ value: UNCATEGORIZED_VALUE, label: "Uncategorized", color: UNCATEGORIZED_COLOR }, ...options];
});

// Real categories + the Uncategorized entry, used for the "N of M categories" chip.
const totalCategoryCount = computed(() => categoryOptions.value.length);

// Ids the URL's category filter is checked against. Undefined until the list has loaded, so a shared link is not
// pruned before the categories are known.
const knownCategoryIds = () =>
    isCategoriesPending.value || !categoriesData.value
        ? undefined
        : categoryOptions.value.map((option) => option.value);

// Single source of filter state: everything but the search input text lives in the URL (see useTransactionFilters).
const {
    searchQuery,
    typeFilter,
    selectedCategoryIds,
    sortOption,
    period,
    showHidden,
    listParams,
    summaryParams,
    activeFilterCount,
    activeChips,
    hasActiveFilters,
    clearAllFilters,
} = useTransactionFilters({
    totalCategoryCount: () => totalCategoryCount.value,
    knownCategoryIds,
});

// Below md the page switches to the compact mobile experience: compact header,
// collapsible summary, bottom-sheet filters, and tap-to-navigate rows.
const isDesktop = useIsDesktop();

// Inline filters panel (desktop) / bottom-sheet (mobile) visibility. The desktop
// panel's state is kept in app state so it is still open when returning from a
// transaction; the mobile sheet always starts closed. The compact header's filter
// icon and the desktop Filters button toggle the same flag.
const desktopFiltersOpen = useState("transactions-filters-open", () => false);
const mobileFiltersOpen = ref(false);
const filtersOpen = computed({
    get: () => (isDesktop.value ? desktopFiltersOpen.value : mobileFiltersOpen.value),
    set: (open: boolean) => {
        if (isDesktop.value) desktopFiltersOpen.value = open;
        else mobileFiltersOpen.value = open;
    },
});

// Server-driven, paginated list.
const { data, error, isLoading, isFetching, isFetchingNextPage, hasNextPage, fetchNextPage } =
    useInfiniteTransactions(listParams);

// True from the moment listParams changes (a filter/search/timeframe/sort
// edit) until the resulting fetch settles — latched explicitly rather than
// inferred from fetch state, because isFetching alone can't tell a listParams
// change apart from a mutation's invalidateQueries refetch (hide, edit
// category, mark transfer, sync, etc. all invalidate the same query key). The
// latch is set by the watch(listParams, ...) below and cleared here once
// isFetching drops, so a mutation-triggered refetch never fades the list —
// its optimistic update (see useUpdateTransaction.mutation.ts) already gives
// instant feedback, and dimming the whole list on every row action would be
// wrong. Also excluded: the first load (handled by the spinner, isLoading)
// and an infinite-scroll next-page append (isFetchingNextPage). Drives the
// list fade so a filter change reads as "results updating" instead of a
// frozen UI that then swaps abruptly. `keepPreviousData` keeps the old rows
// mounted underneath, so the fade cross-dissolves old → new.
const paramsChanging = ref(false);
watch(isFetching, (fetching) => {
    if (!fetching) paramsChanging.value = false;
});
const isRefetching = computed(() => paramsChanging.value && !isFetchingNextPage.value && !isLoading.value);

// Aggregate totals for the active filters (always excludes hidden rows, so the
// metrics never react to the show-hidden toggle).
const { data: summary, isLoading: isSummaryLoading } = useTransactionsSummary(summaryParams);

// Flatten the loaded pages and dedupe by id (drift insurance against a row
// shifting pages between fetches).
const transactions = computed<ITransactionResponse[]>(() => {
    const flat = data.value?.pages.flatMap((page) => page.data) ?? [];
    const seen = new Set<string>();
    const result: ITransactionResponse[] = [];
    for (const transaction of flat) {
        if (!seen.has(transaction.id)) {
            seen.add(transaction.id);
            result.push(transaction);
        }
    }
    return result;
});

// Total matching rows come from the most recently loaded page.
const total = computed(() => {
    const pages = data.value?.pages;
    return pages?.length ? (pages[pages.length - 1]?.total ?? 0) : 0;
});

// The list is inside a v-else, so it isn't mounted during the initial
// loading/error states.
const listRows = ref<InstanceType<typeof TransactionsListRows> | null>(null);

// listParams changes on every sort/search/type/category/timeframe edit, which
// restarts the infinite list at page 1 while its scroller keeps the old
// scrollTop. Reset the scroll immediately — before the shorter page-1 result
// lands — rather than waiting on the new data: keepPreviousData keeps the old
// rows mounted under the fade while refetching, so jumping to the top reads
// correctly, and it's what prevents the browser from clamping scrollTop to
// the new bottom (landing the user mid-list) and the sentinel from firing a
// spurious extra fetchNextPage() the moment the shorter list lands. The
// computed returns a fresh object each time it re-evaluates, so identity
// comparison alone is enough to fire this — no `deep` needed. This is also
// the one place that knows listParams (rather than any background fetch)
// changed, so it doubles as the trigger for the isRefetching fade latch
// above — both effects fire off the same event, so they share one watcher.
watch(listParams, () => {
    paramsChanging.value = true;
    listRows.value?.scrollToTop();
});

// Going to a transaction's detail page: remember where the list was scrolled so
// returning restores the same row. Only the detail page saves; any other
// navigation leaves the slot alone.
onBeforeRouteLeave((to) => {
    if (/^\/transactions\/[^/]+$/.test(to.path)) {
        saveListScroll(listScrollKey(listParams.value), listRows.value?.getScrollTop() ?? 0);
    }
});

// Coming back from the detail page: restore only when the same list is still
// cached, because the infinite-query pages are then rendered at the same height
// straight away. If the cache was collected or the params differ, the list
// starts at the top as before.
const queryClient = useQueryClient();
const restoreTop = takeListScroll(listScrollKey(listParams.value));
const canRestore = restoreTop !== null && !!queryClient.getQueryData(transactionKeys.infinite(listParams.value));
if (canRestore) {
    const stop = watch(
        listRows,
        async (rows) => {
            if (!rows) return;
            await nextTick();
            rows.scrollToOffset(restoreTop);
            stop();
        },
        { immediate: true },
    );
}

const isApplyingRules = ref<boolean>(false);

const createDialogVisible = ref(false);
const createPrefill = ref<TransactionFormPrefill | undefined>(undefined);

const handleCreateTransaction = () => {
    createPrefill.value = undefined;
    createDialogVisible.value = true;
};

// "Record a cash payment" deep link: ?create=expense&accountId=…&categoryId=… opens the create dialog
// prefilled, then drops those keys so a refresh or back doesn't reopen it.
const route = useRoute();
const { data: accountsData } = useGetAccounts();
const queryString = (v: unknown) => (typeof v === "string" && v ? v : undefined);
const applyCreateQuery = () => {
    if (route.query.create !== "expense") return;
    const accounts = accountsData.value;
    const categories = categoriesData.value as ICategoryResponse[] | undefined;
    if (!accounts || !categories) return; // re-run once they load
    const accountId = queryString(route.query.accountId);
    const categoryId = queryString(route.query.categoryId);
    createPrefill.value = {
        type: "expense",
        ...(accountId && accounts.some((a) => a.id === accountId) ? { accountId } : {}),
        ...(categoryId && categories.some((c) => c.id === categoryId) ? { categoryId } : {}),
    };
    createDialogVisible.value = true;
    const rest = { ...route.query };
    delete rest.create;
    delete rest.accountId;
    delete rest.categoryId;
    void router.replace({ query: rest });
};
watch([() => route.query, accountsData, categoriesData], applyCreateQuery, { immediate: true });

const handleTransactionClick = (transaction: ITransactionResponse) => {
    router.push(`/transactions/${transaction.id}`);
};

const handleApplyingRules = (applying: boolean) => {
    isApplyingRules.value = applying;
};

// Expose method for child components
defineExpose({
    handleApplyingRules,
});
</script>

<template>
    <!-- Full-height flex column: header/metrics/toolbar/panel/chips stay pinned,
         only the list region below scrolls. -->
    <div class="flex h-full min-h-0 flex-col">
        <!-- Rendered before the loading/error chain so the header stays up while
             the list loads or fails. On mobile the toolbar sits in the header's
             second row. -->
        <LayoutPageHeader title="Transactions">
            <template
                v-if="!isDesktop"
                #toolbar
            >
                <TransactionsToolbar
                    v-model:search-query="searchQuery"
                    v-model:period="period"
                    v-model:filters-open="filtersOpen"
                    v-model:sort-option="sortOption"
                    :active-filter-count="activeFilterCount"
                />
            </template>
            <template #actions>
                <LayoutHeaderSync />
                <LayoutHeaderButton
                    v-if="isDesktop"
                    label="New"
                    icon="pi pi-plus"
                    primary
                    aria-label="New transaction"
                    @click="handleCreateTransaction"
                />
            </template>
        </LayoutPageHeader>

        <!-- These render *instead of* the list, so on mobile (where the page is
             full-bleed and the layout adds no padding) they need their own
             horizontal gutter to avoid sitting flush against the screen edge. -->
        <ProgressSpinner
            v-if="isLoading"
            class="mx-4 md:mx-0"
        />

        <Message
            v-else-if="error"
            severity="error"
            class="mx-4 md:mx-0"
        >
            Error loading transactions
        </Message>

        <div
            v-else
            class="flex min-h-0 flex-1 flex-col"
        >
            <!-- Applying Rules Message -->
            <Message
                v-if="isApplyingRules"
                severity="info"
                :closable="false"
                class="mx-4 mb-4 shrink-0 md:mx-0"
            >
                <i class="pi pi-spin pi-spinner mr-2"></i>
                Applying category rules to transactions...
            </Message>

            <!-- Metrics strip fed by the summary endpoint (reacts to filters, never
                 to the show-hidden toggle). The bottom margins below are md-only:
                 on mobile these sections are full-bleed and sit flush, separated
                 by their own border-b rather than by a gap. -->
            <TransactionsMetricsStrip
                :summary="summary"
                :loading="isSummaryLoading"
                class="shrink-0 md:mb-4"
            />

            <!-- Desktop toolbar: search + timeframe + Filters toggle. Mobile
                 controls live in the page header's second row instead. -->
            <TransactionsToolbar
                v-if="isDesktop"
                v-model:search-query="searchQuery"
                v-model:period="period"
                v-model:filters-open="filtersOpen"
                v-model:sort-option="sortOption"
                :active-filter-count="activeFilterCount"
                class="mb-3 shrink-0"
            />

            <!-- Inline filters panel (desktop only; mobile uses the bottom sheet) -->
            <TransactionsFiltersPanel
                v-if="isDesktop && filtersOpen"
                v-model:type-filter="typeFilter"
                v-model:selected-category-ids="selectedCategoryIds"
                v-model:show-hidden="showHidden"
                :category-options="categoryOptions"
                class="mb-3 shrink-0"
                @clear-all="clearAllFilters"
            />

            <!-- Filters bottom sheet (mobile only) -->
            <TransactionsFiltersSheet
                v-if="!isDesktop"
                v-model:visible="filtersOpen"
                v-model:type-filter="typeFilter"
                v-model:selected-category-ids="selectedCategoryIds"
                v-model:show-hidden="showHidden"
                :category-options="categoryOptions"
                @clear-all="clearAllFilters"
            />

            <!-- Active filter chips (desktop only; mobile relies on the badge) -->
            <div
                v-if="isDesktop && hasActiveFilters"
                class="mb-4 shrink-0"
            >
                <TransactionsActiveFilterChips :chips="activeChips" />
            </div>

            <!-- The list takes all the height left by the pinned chrome above and
                 scrolls internally: it owns the scroller, the infinite-scroll
                 sentinel and the refetch fade, and asks for the next page via
                 @load-more. -->
            <TransactionsListRows
                ref="listRows"
                :transactions="transactions"
                :has-more="hasNextPage"
                :is-loading-more="isFetchingNextPage"
                :total="total"
                :refetching="isRefetching"
                clickable
                class="min-h-0 flex-1"
                @load-more="fetchNextPage"
                @transaction-click="handleTransactionClick"
                @applying-rules="handleApplyingRules"
            />
        </div>

        <!-- Mobile-only create shortcut; desktop uses the header "New" button. -->
        <Button
            v-if="!isLoading && !error"
            rounded
            aria-label="Create Transaction"
            class="fixed bottom-[calc(4rem+env(safe-area-inset-bottom))] right-4 z-[60] h-12 w-12 shadow-lg md:hidden"
            @click="handleCreateTransaction"
        >
            <i class="pi pi-plus text-xl"></i>
        </Button>

        <CreateTransactionDialog
            v-model:visible="createDialogVisible"
            :prefill="createPrefill"
        />
    </div>
</template>
