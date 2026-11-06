<script setup lang="ts">
import type { TransactionType } from "@badger/shared-data";
import type { ICategoryResponse, ITransactionResponse } from "@badger/types";
import { useQueryClient } from "@tanstack/vue-query";
import {
    transactionKeys,
    useInfiniteTransactions,
    useTransactionAccountFacets,
    useTransactionCategoryFacets,
    useTransactionsSummary,
    useTransactionTypeFacets,
} from "../../composables/transactions/useTransactions";
import { useTransactionFilters } from "../../composables/transactions/useTransactionFilters";
import { listScrollKey, saveListScroll, takeListScroll } from "../../utils/listScroll";
import {
    buildAccountFilterOptions,
    buildCategoryFilterOptions,
    buildTypeFilterOptions,
    type FilterOption,
    UNCATEGORIZED_VALUE,
} from "../../utils/filterOptions";
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

const { data: categoriesData, isPending: isCategoriesPending } = useGetCategoriesQuery();
const { data: accountsData, isPending: isAccountsPending } = useGetAccounts();

// Ids the URL's category filter is checked against. Built from the full categories list, not the offered options,
// so a shared link's category is not pruned just because it has no matches in the current view. Undefined until the
// list has loaded, so a shared link is not pruned before the categories are known.
const knownCategoryIds = () =>
    isCategoriesPending.value || !categoriesData.value
        ? undefined
        : [UNCATEGORIZED_VALUE, ...(categoriesData.value as ICategoryResponse[]).map((category) => category.id)];

// Ids the URL's account filter is checked against, the same way as the categories. Undefined until the accounts load.
const knownAccountIds = () => accountsData.value?.map((account) => account.id);

// Single source of filter state: everything but the search input text lives in the URL (see useTransactionFilters).
const {
    searchQuery,
    selectedTypes,
    selectedAccountIds,
    selectedCategoryIds,
    sortOption,
    period,
    showHidden,
    listParams,
    summaryParams,
    categoryFacetParams,
    accountFacetParams,
    typeFacetParams,
    drawerFilterCount,
    activeFilterCount,
    clearAllFilters,
} = useTransactionFilters({
    knownCategoryIds,
    knownAccountIds,
});

// Per-category counts for the current view (every filter except the category selection). They decide which categories
// are offered. keepPreviousData keeps the previous counts on screen while a refetch is in flight.
const {
    data: facetData,
    isPending: isFacetPending,
    isError: isFacetError,
} = useTransactionCategoryFacets(categoryFacetParams);

const facetFailed = computed(() => isFacetError.value && !facetData.value);

// Offered categories: those with rows in the current view, plus any selected one (kept, dimmed as stale, so it can
// still be cleared). If the counts fail, every category is offered instead. Empty until both queries have data: a lone
// "Uncategorized" entry would look like a full selection to the filter's collapse-to-"all" rule, so the first tap
// would be silently swallowed. An empty chip row also reads as "loading".
const categoryOptions = computed<FilterOption[]>(() => {
    if (isCategoriesPending.value || (isFacetPending.value && !facetFailed.value)) return [];

    return buildCategoryFilterOptions({
        categories: categoriesData.value as ICategoryResponse[] | undefined,
        facets: facetData.value?.categories,
        facetFailed: facetFailed.value,
        selectedIds: selectedCategoryIds.value,
    });
});

// Per-account and per-type counts for the current view, with the same offering rules as the categories above. Each
// facet ignores its own selection, so a picker's options stay put while it is edited.
const {
    data: accountFacetData,
    isPending: isAccountFacetPending,
    isError: isAccountFacetError,
} = useTransactionAccountFacets(accountFacetParams);
const accountFacetFailed = computed(() => isAccountFacetError.value && !accountFacetData.value);

const {
    data: typeFacetData,
    isPending: isTypeFacetPending,
    isError: isTypeFacetError,
} = useTransactionTypeFacets(typeFacetParams);
const typeFacetFailed = computed(() => isTypeFacetError.value && !typeFacetData.value);

// Same loading guard as the categories: no options until the source list and the counts are in, so a lone option
// cannot collapse the first tap.
const accountOptions = computed<FilterOption[]>(() => {
    if (isAccountsPending.value || (isAccountFacetPending.value && !accountFacetFailed.value)) return [];

    return buildAccountFilterOptions({
        accounts: accountsData.value,
        facets: accountFacetData.value?.accounts,
        facetFailed: accountFacetFailed.value,
        selectedIds: selectedAccountIds.value,
    });
});

const typeOptions = computed<FilterOption<TransactionType>[]>(() => {
    if (isTypeFacetPending.value && !typeFacetFailed.value) return [];

    return buildTypeFilterOptions({
        facets: typeFacetData.value?.types,
        facetFailed: typeFacetFailed.value,
        selected: selectedTypes.value,
    });
});

// Below md the page switches to the compact mobile experience: compact header,
// collapsible summary, bottom-sheet filters, and tap-to-navigate rows.
const isDesktop = useIsDesktop();

// Mobile bottom-sheet visibility. The compact header's Filters button toggles it. The desktop toolbar has no drawer,
// so the flag only matters below md.
const mobileFiltersOpen = ref(false);

// Server-driven, paginated list.
const { data, error, isLoading, isFetchingNextPage, isPlaceholderData, hasNextPage, fetchNextPage } =
    useInfiniteTransactions(listParams);

// Drives the list fade so a filter change reads as "results updating" instead of a frozen UI that then swaps abruptly.
// isPlaceholderData is true only while the previous key's rows are shown under keepPreviousData (see
// useInfiniteTransactions), so it covers the fetch for a new key and clears as soon as that key's data is served, even
// from cache with no fetch. A mutation's invalidateQueries refetch keeps the same key, so it never fades the list: its
// optimistic update (see useUpdateTransaction.mutation.ts) already gives instant feedback, and dimming the whole list on
// every row action would be wrong. Also excluded: the first load (handled by the spinner, isLoading) and an
// infinite-scroll next-page append (isFetchingNextPage). `keepPreviousData` keeps the old rows mounted underneath, so
// the fade cross-dissolves old → new.
const isRefetching = computed(() => isPlaceholderData.value && !isFetchingNextPage.value && !isLoading.value);

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
// comparison alone is enough to fire this — no `deep` needed.
watch(listParams, () => {
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

const createDialogVisible = ref(false);
const createPrefill = ref<TransactionFormPrefill | undefined>(undefined);

const handleCreateTransaction = () => {
    createPrefill.value = undefined;
    createDialogVisible.value = true;
};

// "Record a cash payment" deep link: ?create=expense&accountId=…&categoryId=… opens the create dialog
// prefilled, then drops those keys so a refresh or back doesn't reopen it.
const route = useRoute();
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
</script>

<template>
    <!-- Full-height flex column: header/metrics/toolbar stay pinned,
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
                    v-model:filters-open="mobileFiltersOpen"
                    :drawer-filter-count="drawerFilterCount"
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
            <!-- Metrics strip fed by the summary endpoint (reacts to filters, never
                 to the show-hidden toggle). The bottom margins below are md-only:
                 on mobile these sections are full-bleed and sit flush, separated
                 by their own border-b rather than by a gap. -->
            <TransactionsMetricsStrip
                :summary="summary"
                :loading="isSummaryLoading"
                class="shrink-0 md:mb-4"
            />

            <!-- Desktop toolbar: search, the period and one picker per filter, then show hidden and Clear all. -->
            <TransactionsToolbar
                v-if="isDesktop"
                v-model:search-query="searchQuery"
                v-model:period="period"
                v-model:selected-category-ids="selectedCategoryIds"
                v-model:selected-account-ids="selectedAccountIds"
                v-model:selected-types="selectedTypes"
                v-model:show-hidden="showHidden"
                :category-options="categoryOptions"
                :account-options="accountOptions"
                :type-options="typeOptions"
                :active-filter-count="activeFilterCount"
                :drawer-filter-count="drawerFilterCount"
                class="mb-3 shrink-0"
                @clear-all="clearAllFilters"
            />

            <!-- Filters bottom sheet (mobile only) -->
            <TransactionsFiltersSheet
                v-if="!isDesktop"
                v-model:visible="mobileFiltersOpen"
                v-model:selected-types="selectedTypes"
                v-model:selected-category-ids="selectedCategoryIds"
                v-model:show-hidden="showHidden"
                :category-options="categoryOptions"
                @clear-all="clearAllFilters"
            />

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
            >
                <template #header-actions>
                    <TransactionsSortMenu
                        v-model="sortOption"
                        :compact="!isDesktop"
                    />
                </template>
            </TransactionsListRows>
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
