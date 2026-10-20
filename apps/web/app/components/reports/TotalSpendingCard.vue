<script setup lang="ts">
import type { SpendingReport } from "@badger/types";
import { formatCurrency } from "~/utils/currency";

const props = defineProps<{
    report: SpendingReport;
    /** e.g. "vs last month" — depends on the selected period preset. */
    comparisonLabel: string;
    /** Inclusive number of months in the selected period. */
    monthCount: number;
}>();

const isMonthlyAvg = defineModel<boolean>("isMonthlyAvg", { default: false });

// Beyond this many segments the stacked bar becomes unreadable slivers, so
// the tail is merged into a grey "Other" segment. The categories list next to
// this card still shows every category.
const MAX_SEGMENTS = 6;
const OTHER_COLOR = "#9ca3af";

interface Segment {
    label: string;
    color: string;
    value: number;
}

const segments = computed<Segment[]>(() => {
    const items = props.report.categories.map((item) => ({
        label: item.name,
        color: item.color,
        value: item.percentage,
    }));

    if (items.length <= MAX_SEGMENTS) {
        return items;
    }

    const rest = items.slice(MAX_SEGMENTS);
    const restValue = Math.round(rest.reduce((sum, segment) => sum + segment.value, 0) * 10) / 10;

    return [...items.slice(0, MAX_SEGMENTS), { label: "Other", color: OTHER_COLOR, value: restValue }];
});

// The trend is spelled out in the text, so the direction never rests on colour alone.
const trend = computed<{ tone: "neutral" | "success" | "danger"; value: string } | null>(() => {
    const comparison = props.report.comparison;
    // No previous spending to compare against — hide the pill.
    if (comparison.changePercentage === null) {
        return null;
    }

    if (comparison.direction === "flat") {
        return { tone: "neutral", value: `No change ${props.comparisonLabel}` };
    }

    const percentage = Math.abs(comparison.changePercentage);

    // More spending is bad news, hence up = danger.
    return comparison.direction === "up"
        ? { tone: "danger", value: `Up ${percentage}% ${props.comparisonLabel}` }
        : { tone: "success", value: `Down ${percentage}% ${props.comparisonLabel}` };
});

// Parse YYYY-MM-DD as local date parts to avoid UTC-midnight shifting.
const parseIsoDate = (iso: string) => {
    const [year, month, day] = iso.split("-").map(Number);
    return new Date(year ?? 0, (month ?? 1) - 1, day ?? 1);
};

const rangeLabel = computed(() => {
    const start = parseIsoDate(props.report.startDate).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
    });
    const end = parseIsoDate(props.report.endDate).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
    });

    return `${start} – ${end}`;
});

const monthlyAvgOpts = ref([
    { label: "Total", value: false },
    { label: "Monthly avg", value: true },
]);

// A single-month period has no average to show — the parent forces
// isMonthlyAvg back to false via v-model when this goes false.
const canToggleMonthlyAvg = computed(() => props.monthCount > 1);

const displayTotal = computed(() => (isMonthlyAvg.value ? props.report.total / props.monthCount : props.report.total));
</script>

<template>
    <SharedSectionBand title="Total spending">
        <template #header-extra>
            <SelectButton
                v-model="isMonthlyAvg"
                :options="monthlyAvgOpts"
                option-label="label"
                option-value="value"
                :allow-empty="false"
                :disabled="!canToggleMonthlyAvg"
                aria-label="Total or monthly average"
            />
        </template>

        <div class="px-4 pb-4 md:px-0 md:pb-0">
            <div class="text-4xl font-bold">
                {{ formatCurrency(displayTotal, report.currency.code)
                }}<span
                    v-if="isMonthlyAvg"
                    class="text-xl font-semibold text-surface-500 dark:text-surface-300"
                    >/month</span
                >
            </div>
            <SharedStatusTag
                v-if="trend"
                class="mt-3"
                :value="trend.value"
                :tone="trend.tone"
            />

            <MeterGroup
                class="mt-6"
                :value="segments"
                :dt="{ gap: '3px', borderRadius: '9999px', meters: { size: '0.85rem' } }"
            >
                <!-- Replaces the built-in legend (an empty template would fall back to it). -->
                <template #label>
                    <div class="mt-4 flex flex-wrap gap-x-4 gap-y-2">
                        <div
                            v-for="segment in segments"
                            :key="segment.label"
                            class="flex items-center gap-2"
                        >
                            <span
                                class="h-2 w-2 shrink-0 rounded-full"
                                :style="{ backgroundColor: segment.color }"
                            />
                            <span class="text-sm">
                                {{ segment.label }}
                                <span class="text-surface-500 dark:text-surface-300">{{ segment.value }}%</span>
                            </span>
                        </div>
                    </div>
                </template>
            </MeterGroup>

            <div
                class="mt-5 flex items-center justify-between border-t border-surface-200 pt-4 text-sm text-surface-500 dark:border-surface-700 dark:text-surface-300"
            >
                <span>{{ rangeLabel }}</span>
                <span>{{ report.transactionCount }} transactions</span>
            </div>
        </div>
    </SharedSectionBand>
</template>
