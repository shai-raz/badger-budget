<script setup lang="ts">
import type { SpendingReport } from "@badger/types";
import { formatCurrency } from "~/utils/currency";

const props = defineProps<{
    report: SpendingReport;
    isMonthlyAvg: boolean;
    /** Inclusive number of months in the selected period. */
    monthCount: number;
}>();

const categoryCountLabel = computed(() => {
    const count = props.report.categories.length;
    return count === 1 ? "1 category" : `${count} categories`;
});

const displayAmount = (amount: number) => (props.isMonthlyAvg ? amount / props.monthCount : amount);
</script>

<template>
    <SharedSectionBand
        title="Categories"
        :meta="categoryCountLabel"
    >
        <div class="divide-y divide-surface-200 dark:divide-surface-700">
            <div
                v-for="item in report.categories"
                :key="item.categoryId ?? 'uncategorized'"
                class="px-4 py-4 md:px-0"
            >
                <div class="flex items-center justify-between gap-3">
                    <div class="flex min-w-0 items-center gap-2.5">
                        <span
                            class="h-3 w-3 shrink-0 rounded-full"
                            :style="{ backgroundColor: item.color }"
                        />
                        <span class="truncate font-medium">{{ item.name }}</span>
                    </div>
                    <span class="shrink-0 font-semibold">
                        {{ formatCurrency(displayAmount(item.amount), report.currency.code)
                        }}<span
                            v-if="isMonthlyAvg"
                            class="font-normal text-surface-500 dark:text-surface-300"
                            >/month</span
                        >
                    </span>
                </div>
                <div class="mt-2 flex items-center gap-3">
                    <ProgressBar
                        class="flex-1"
                        :value="item.percentage"
                        :show-value="false"
                        :dt="{ value: { background: item.color }, height: '8px', borderRadius: '9999px' }"
                    />
                    <span class="w-11 shrink-0 text-right text-sm font-semibold text-surface-500 dark:text-surface-300">
                        {{ item.percentage }}%
                    </span>
                </div>
            </div>
        </div>
    </SharedSectionBand>
</template>
