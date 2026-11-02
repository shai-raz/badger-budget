<script setup lang="ts">
import type { SpendingReport } from "@badger/types";
import Chart from "primevue/chart";
import { chartColors } from "~/theme/themes";
import { formatCurrencyRounded } from "~/utils/currency";
import { topCategoriesWithOther } from "~/utils/spendingBreakdown";

const props = defineProps<{
    report: SpendingReport;
}>();

// The theme store is the single source of truth for dark mode (app/stores/theme.ts).
// The chart's border color (drawn between slices) and the "Other" slice come from the theme,
// since Chart.js needs hex. Slice colors are category colors, which read fine on both surfaces.
const themeStore = useThemeStore();
const isDark = computed(() => themeStore.isDark);
const colors = computed(() => chartColors(themeStore.definition, themeStore.colorMode));

const slices = computed(() =>
    topCategoriesWithOther(props.report.categories, props.report.total, 4, colors.value.other),
);

const chartData = computed(() => ({
    labels: slices.value.map((slice) => slice.name),
    datasets: [
        {
            data: slices.value.map((slice) => slice.amount),
            backgroundColor: slices.value.map((slice) => slice.color),
            borderColor: colors.value.sliceBorder,
            borderWidth: 2,
        },
    ],
}));

const chartOptions = computed(() => ({
    cutout: "72%",
    maintainAspectRatio: false,
    responsive: true,
    plugins: {
        legend: { display: false },
        tooltip: {
            callbacks: {
                label: (ctx: { dataIndex: number }) => {
                    const slice = slices.value[ctx.dataIndex];
                    return slice
                        ? `${slice.name}: ${formatCurrencyRounded(slice.amount, props.report.currency.code)}`
                        : "";
                },
            },
        },
    },
}));

const centerTotal = computed(() => formatCurrencyRounded(props.report.total, props.report.currency.code));
</script>

<template>
    <div class="flex items-center gap-6 px-4 pb-3 md:px-0 md:pb-0">
        <div class="relative h-32 w-32 shrink-0 md:h-40 md:w-40">
            <Chart
                :key="isDark ? 'dark' : 'light'"
                type="doughnut"
                :data="chartData"
                :options="chartOptions"
                class="h-full w-full"
            />
            <div class="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-2">
                <span class="text-xs text-muted-color">Spent</span>
                <span
                    class="max-w-full truncate text-sm font-semibold text-surface-900 dark:text-surface-0 md:text-lg"
                    >{{ centerTotal }}</span
                >
            </div>
        </div>

        <ul class="min-w-0 flex-1 space-y-2">
            <li
                v-for="slice in slices"
                :key="slice.key"
                class="flex items-center gap-2 text-sm"
            >
                <span
                    class="h-2.5 w-2.5 shrink-0 rounded-full"
                    :style="{ backgroundColor: slice.color }"
                />
                <span class="min-w-0 flex-1 truncate text-surface-900 dark:text-surface-0">{{ slice.name }}</span>
                <span class="shrink-0 whitespace-nowrap font-bold tabular-nums text-surface-900 dark:text-surface-0">
                    {{ formatCurrencyRounded(slice.amount, report.currency.code) }}
                </span>
                <span class="w-10 shrink-0 text-right text-muted-color">{{ slice.percentage }}%</span>
            </li>
        </ul>
    </div>
</template>
