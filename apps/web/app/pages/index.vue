<script setup lang="ts">
import { useTransactionsSummary, useRecentTransactions } from "~/composables/transactions/useTransactions";
import { useSpendingReport } from "~/composables/reports/useSpendingReport";

// fullBleed: below md the header, metrics strip and sections run edge to
// edge, separated by gaps (see the wrapper's gap-3 below) instead of the
// scroller's default padding. Desktop is unaffected (see layouts/app.vue).
definePageMeta({
    layout: "app",
    fullBleed: true,
});

const isDesktop = useIsDesktop();

// Server-side aggregate totals for the current calendar month.
const {
    data: summary,
    isLoading: isSummaryLoading,
    error: summaryError,
} = useTransactionsSummary(computed(() => currentMonthRange()));

// Recent transactions band: 5 rows on desktop, 4 on mobile (narrower rows).
const recentLimit = computed(() => (isDesktop.value ? 5 : 4));
const { data: recentTransactions, isLoading: isRecentLoading, error: recentError } = useRecentTransactions(recentLimit);

// Where it went donut: current calendar month's spending breakdown.
const {
    data: spendingReport,
    isLoading: isSpendingLoading,
    error: spendingError,
} = useSpendingReport(computed(() => currentMonthRange()));
</script>

<template>
    <div class="flex flex-col gap-3 pb-8 md:gap-6">
        <LayoutPageHeader title="Overview">
            <template #actions>
                <LayoutHeaderSync />
            </template>
        </LayoutPageHeader>

        <Message
            v-if="summaryError"
            severity="error"
            :closable="false"
        >
            Couldn't load this month's summary.
        </Message>
        <TransactionsMetricsStrip
            v-else
            :summary="summary"
            :loading="isSummaryLoading"
            mobile-surface="raised"
        />

        <DashboardAccountsSection />

        <!-- Middle row: Recent transactions + Where it went. Side by side only at
             xl+ (Recent gets the wider column) — below that "Where it went"
             gets cut off if forced into a narrow side column, so it stacks
             under Recent instead, same as the mobile layout. -->
        <div class="flex flex-col gap-3 md:gap-4 xl:grid xl:grid-cols-[1.35fr_1fr] xl:items-start">
            <SharedSectionBand
                title="Recent transactions"
                mobile-title="Recent"
                link-to="/transactions"
                link-label="All transactions"
                :loading="isRecentLoading"
                :error="recentError"
                :empty="!recentTransactions?.length"
                empty-text="No transactions yet"
            >
                <template #skeleton>
                    <div class="flex flex-col gap-3 px-4 pb-3 md:px-0 md:pb-0">
                        <div
                            v-for="i in 5"
                            :key="i"
                            class="flex items-center gap-3"
                        >
                            <Skeleton
                                shape="circle"
                                size="2.5rem"
                            />
                            <div class="flex flex-1 flex-col gap-2">
                                <Skeleton
                                    height="0.875rem"
                                    width="60%"
                                />
                                <Skeleton
                                    height="0.75rem"
                                    width="40%"
                                />
                            </div>
                        </div>
                    </div>
                </template>

                <DashboardRecentTransactions :transactions="recentTransactions ?? []" />
            </SharedSectionBand>

            <SharedSectionBand
                title="Where it went"
                :loading="isSpendingLoading"
                :error="spendingError"
                :empty="!spendingReport || spendingReport.total === 0"
                empty-text="No spending this month"
            >
                <template #skeleton>
                    <div class="flex items-center gap-6 px-4 pb-3 md:px-0 md:pb-0">
                        <Skeleton
                            shape="circle"
                            size="8rem"
                        />
                        <div class="flex flex-1 flex-col gap-2">
                            <Skeleton height="0.875rem" />
                            <Skeleton height="0.875rem" />
                            <Skeleton height="0.875rem" />
                            <Skeleton height="0.875rem" />
                        </div>
                    </div>
                </template>

                <DashboardSpendingDonut
                    v-if="spendingReport"
                    :report="spendingReport"
                />
            </SharedSectionBand>
        </div>

        <DashboardBudgetsSection />
    </div>
</template>
