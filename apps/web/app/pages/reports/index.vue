<script setup lang="ts">
import { useSpendingReport } from "~/composables/reports/useSpendingReport";

// fullBleed: below md the bands run edge to edge, as on Overview (see layouts/app.vue).
definePageMeta({
    layout: "app",
    fullBleed: true,
});

type PeriodPreset = "this-month" | "last-month" | "this-year";

const periodOptions: Array<{ label: string; value: PeriodPreset }> = [
    { label: "This month", value: "this-month" },
    { label: "Last month", value: "last-month" },
    { label: "This year", value: "this-year" },
];

const monthKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

const presetRange = (preset: PeriodPreset): { from: string; to: string } => {
    const now = new Date();

    switch (preset) {
        case "this-month": {
            const month = monthKey(now);
            return { from: month, to: month };
        }
        case "last-month": {
            const month = monthKey(new Date(now.getFullYear(), now.getMonth() - 1, 1));
            return { from: month, to: month };
        }
        case "this-year":
            // Full calendar year so the comparison window is the full prior year.
            return { from: `${now.getFullYear()}-01`, to: `${now.getFullYear()}-12` };
    }
};

const selectedPreset = ref<PeriodPreset | null>("this-month");
const monthRange = ref(presetRange("this-month"));

watch(selectedPreset, (preset) => {
    if (preset) {
        monthRange.value = presetRange(preset);
    }
});

// Editing the picker directly switches to a custom range: clear the preset
// unless the new range still matches it (which is how preset clicks land here).
watch(
    monthRange,
    (range) => {
        if (!selectedPreset.value) return;
        const expected = presetRange(selectedPreset.value);
        if (range.from !== expected.from || range.to !== expected.to) {
            selectedPreset.value = null;
        }
    },
    { deep: true },
);

// Build YYYY-MM-DD strings directly — never toISOString() on a local date.
const lastDayOfMonth = (year: number, month: number) => new Date(year, month, 0).getDate();

const reportParams = computed(() => {
    const { from, to } = monthRange.value;
    if (!from || !to) {
        return { startDate: "", endDate: "" };
    }

    const [toYear, toMonth] = to.split("-").map(Number);
    const endDay = lastDayOfMonth(toYear ?? 0, toMonth ?? 1);

    return {
        startDate: `${from}-01`,
        endDate: `${to}-${String(endDay).padStart(2, "0")}`,
    };
});

const { data: report, isLoading, isFetching, error } = useSpendingReport(reportParams);

const isEmpty = computed(() => !!report.value && report.value.total === 0 && report.value.categories.length === 0);

// Inclusive count of selected months, used to compute monthly averages and
// to disable the average toggle when there's only one month to average over.
const monthCount = computed(() => {
    const { from, to } = monthRange.value;
    if (!from || !to) return 1;

    const [fromYear, fromMonth] = from.split("-").map(Number);
    const [toYear, toMonth] = to.split("-").map(Number);

    return (toYear ?? 0) * 12 + (toMonth ?? 1) - ((fromYear ?? 0) * 12 + (fromMonth ?? 1)) + 1;
});

const isMonthlyAvg = ref(false);

watch(monthCount, (count) => {
    if (count <= 1) {
        isMonthlyAvg.value = false;
    }
});

const comparisonLabel = computed(() => {
    switch (selectedPreset.value) {
        case "this-month":
            return "vs last month";
        case "last-month":
            return "vs previous month";
        case "this-year":
            return "vs last year";
        default:
            return "vs previous period";
    }
});
</script>

<template>
    <div class="flex flex-col gap-3 pb-8 md:gap-6">
        <LayoutPageHeader title="Reports">
            <template #toolbar>
                <div class="flex w-full flex-col gap-2 md:w-auto lg:flex-row lg:items-center lg:gap-3">
                    <SelectButton
                        v-model="selectedPreset"
                        :options="periodOptions"
                        option-label="label"
                        option-value="value"
                        :allow-empty="false"
                        aria-label="Reporting period"
                        class="flex w-full md:w-auto"
                        :pt="{ pcToggleButton: { root: { class: 'flex-1 md:flex-none' } } }"
                    />
                    <SharedMonthRangePicker v-model="monthRange" />
                </div>
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
