<script setup lang="ts">
import type { ITransactionResponse } from "@badger/types";
import TransactionRow from "./TransactionRow.vue";
import ListFooter from "./ListFooter.vue";
import TransactionActionsHost from "./TransactionActionsHost.vue";

interface Props {
    transactions: ITransactionResponse[];
    /** Whether another page can be fetched (TanStack `hasNextPage`). */
    hasMore: boolean;
    /** Whether the next page is currently loading (`isFetchingNextPage`). */
    isLoadingMore: boolean;
    /** Total matching rows across all pages (last page's `total`). */
    total: number;
    /** Whether a row click navigates to the detail page. */
    clickable?: boolean;
    /** Whether a filter/search/timeframe change is refetching (fades the rows). */
    refetching?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
    clickable: false,
    refetching: false,
});

const emit = defineEmits<{
    transactionClick: [transaction: ITransactionResponse];
    applyingRules: [isApplying: boolean];
    loadMore: [];
}>();

// The card is a fixed frame pinned to the height it is given and the scrolling
// happens inside it, so both rounded ends and the scrollbar stay within the
// card instead of the card sliding through a page-level scroller.
const scrollEl = ref<HTMLElement | null>(null);

// Infinite scroll: the sentinel sits below the rows inside the scroller, so the
// observer must compute intersection against that scroller rather than the
// viewport. rootMargin prefetches a screenful early so "Loading more…" rarely
// shows. The sentinel needs a non-zero height to be observable at all —
// zero-height sentinels never intersect.
const sentinelEl = ref<HTMLElement | null>(null);
useIntersectionObserver(
    sentinelEl,
    ([entry]) => {
        if (entry?.isIntersecting && props.hasMore && !props.isLoadingMore) {
            emit("loadMore");
        }
    },
    { root: scrollEl, rootMargin: "300px" },
);

// Shared overflow menu + Edit / Apply category rule / Mark Card Payoff modals. The custom
// rows have no inline pencil, so every action is surfaced through the menu.
const actionsHost = ref<InstanceType<typeof TransactionActionsHost> | null>(null);

const handleTransactionClick = (transaction: ITransactionResponse) => {
    emit("transactionClick", transaction);
};

const handleMenuToggle = ({ transaction, event }: { transaction: ITransactionResponse; event: Event }) => {
    actionsHost.value?.openMenu(event, transaction);
};

// Called by the page whenever the query (sort/search/type/category/timeframe)
// changes: the infinite list restarts at page 1 while the scroller keeps its
// old scrollTop, so left unhandled the browser clamps it to the new, shorter
// bottom and the user lands mid-list instead of at the top — and the sentinel
// ends up immediately intersecting, firing a spurious extra page load. An
// instant jump (not "smooth") avoids racing the content swap.
const scrollToTop = () => {
    scrollEl.value?.scrollTo({ top: 0 });
};

// Read and restore the scroll position, so the page can bring the list back to
// the same row after a detail page round-trip.
const getScrollTop = () => scrollEl.value?.scrollTop ?? 0;
const scrollToOffset = (top: number) => scrollEl.value?.scrollTo({ top });

defineExpose({ scrollToTop, getScrollTop, scrollToOffset });
</script>

<template>
    <!-- The frame, not the content: it fills the height it is given and clips,
         so its rounded corners stay put at both ends. The card *shape* (border,
         rounding) is md-only — on mobile the list is full-bleed, spanning the
         screen width down to the bottom bar with no gap. The background is not:
         full-bleed changes the frame's shape, not its colour, and the list is
         page chrome (surface-0) like the toolbar. Leaving it md-only let the
         layout scroller's surface-50 show through, which reads as the recessed
         tone used by the totals bar and the search field. -->
    <div
        class="flex min-h-0 flex-1 flex-col overflow-hidden bg-surface-0 md:rounded-xl md:border md:border-surface-200 dark:bg-surface-900 dark:md:border-surface-700"
    >
        <!-- The ONLY scrolling region — the scrollbar sits inside the card.
             Rows carry their own 16px gutter (TransactionRow), so the scroller
             adds only the vertical inset. -->
        <div
            ref="scrollEl"
            class="min-h-0 flex-1 overflow-y-auto pb-3.5 pt-1 md:p-0"
        >
            <!-- Faded while a filter/search/timeframe change refetches, so the
                 swap reads as "results updating" rather than a frozen list. The
                 fade wraps the rows only, never the frame's border. -->
            <div
                class="transition-opacity duration-200 ease-out"
                :class="refetching ? 'pointer-events-none opacity-40' : 'opacity-100'"
            >
                <TransactionRow
                    v-for="transaction in transactions"
                    :key="transaction.id"
                    :transaction="transaction"
                    :clickable="clickable"
                    @click="handleTransactionClick"
                    @menu-toggle="handleMenuToggle"
                />

                <!-- Footer states live inside the bordered container (loading /
                     all caught up / empty), per the design. -->
                <ListFooter
                    :has-more="hasMore"
                    :is-loading="isLoadingMore"
                    :total="total"
                    :loaded-count="transactions.length"
                />
            </div>

            <div
                ref="sentinelEl"
                aria-hidden="true"
                class="h-px"
            ></div>
        </div>

        <!-- Overlays only (popup menu + modals, all teleported to body), so this
             contributes no flex item and no layout of its own. -->
        <TransactionActionsHost
            ref="actionsHost"
            @applying-rules="emit('applyingRules', $event)"
        />
    </div>
</template>
