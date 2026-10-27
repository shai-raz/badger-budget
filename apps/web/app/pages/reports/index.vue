<script setup lang="ts">
import { useSpendingReport } from "~/composables/reports/useSpendingReport";
import { useMonthRangeQuery } from "~/composables/useMonthRangeQuery";
import {
    comparisonLabel as describeComparison,
    currentMonthSelection,
    monthCount as countMonths,
    REPORTS_PRESETS,
    toReportParams,
} from "~/utils/monthRange";

// fullBleed: below md the bands run edge to edge, as on Overview (see layouts/app.vue).
definePageMeta({
    layout: "app",
    fullBleed: true,
});

// The range lives in the URL (?from/?to). Reports has no all-time, so from=all is rejected and reads as this month.
const { selection } = useMonthRangeQuery({ allowAll: false });

// Ticks each minute so a tab left open past midnight moves the "today" end of the range. The query key changes with it,
// so the report refetches, and refetch-on-focus then sends the new day too.
const now = useNow({ interval: 60_000 });

const range = computed(() => (selection.value.kind === "range" ? selection.value : currentMonthSelection(now.value)));
const reportParams = computed(() => toReportParams(range.value, now.value));
const monthCount = computed(() => countMonths(range.value));
const comparisonLabel = computed(() => describeComparison(range.value, now.value));

const { data: report, isLoading, isFetching, error } = useSpendingReport(reportParams);

const isEmpty = computed(() => !!report.value && report.value.total === 0 && report.value.categories.length === 0);

const isMonthlyAvg = ref(false);

watch(monthCount, (count) => {
    if (count <= 1) {
        isMonthlyAvg.value = false;
    }
});
</script>

<template>
    <div class="flex flex-col gap-3 pb-8 md:gap-6">
        <LayoutPageHeader title="Reports">
            <template #controls>
                <SharedPeriodPicker
                    v-model="selection"
                    :presets="REPORTS_PRESETS"
                />
            </template>
        </LayoutPageHeader>

        <ProgressSpinner v-if="isLoading" />

        <SharedSectionBand
            v-else-if="error"
            title="Spending report"
            :error="error"
        />

        <SharedSectionBand
            v-else-if="isEmpty"
            title="Total spending"
            :empty="true"
        >
            <template #empty>
                <SharedEmptyState
                    icon="pi-chart-pie"
                    title="No spending in this period"
                    text="Try a different period to see where your money went."
                />
            </template>
        </SharedSectionBand>

        <div
            v-else-if="report"
            class="grid grid-cols-1 items-start gap-3 transition-opacity md:gap-6 lg:grid-cols-[minmax(340px,420px)_1fr]"
            :class="{ 'opacity-60': isFetching }"
        >
            <ReportsTotalSpendingCard
                v-model:is-monthly-avg="isMonthlyAvg"
                :report="report"
                :comparison-label="comparisonLabel"
                :month-count="monthCount"
            />
            <ReportsCategoryBreakdownList
                :report="report"
                :is-monthly-avg="isMonthlyAvg"
                :month-count="monthCount"
            />
        </div>
    </div>
</template>
