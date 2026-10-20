<script setup lang="ts">
interface Props {
    /** Whether another page can be fetched (TanStack `hasNextPage`). */
    hasMore: boolean;
    /** Whether the next page is currently being fetched (`isFetchingNextPage`). */
    isLoading: boolean;
    /** Total matching rows across all pages (from the last page's `total`). */
    total: number;
    /** Number of rows loaded so far — 0 means the empty state. */
    loadedCount: number;
}

defineProps<Props>();
</script>

<template>
    <!-- Empty: no rows matched the current filters -->
    <div
        v-if="loadedCount === 0 && !isLoading"
        class="text-center py-8"
    >
        <i class="pi pi-inbox text-6xl text-surface-400 mb-4 block"></i>
        <h3 class="text-lg font-medium">No transactions for this period</h3>
        <p class="text-muted-color">Try a different timeframe, category, or search term.</p>
    </div>

    <!-- Loading the next page -->
    <div
        v-else-if="isLoading"
        class="flex items-center justify-center gap-2 py-6 text-muted-color"
    >
        <i class="pi pi-spin pi-spinner"></i>
        <span>Loading more…</span>
    </div>

    <!-- More pages available — the intersection sentinel will trigger the fetch -->
    <div
        v-else-if="hasMore"
        class="flex items-center justify-center gap-2 py-6 text-muted-color"
    >
        <i class="pi pi-angle-down"></i>
        <span>Scroll to load more</span>
    </div>

    <!-- All pages loaded -->
    <div
        v-else-if="total > 0"
        class="text-center py-6 text-muted-color"
    >
        You're all caught up · {{ total }} transactions
    </div>
</template>
