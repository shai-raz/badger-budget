<script setup lang="ts">
import type { BudgetPeriod } from "~/utils/budget";
import { budgetWindowLabel } from "~/utils/budget";

const props = defineProps<{
    period: BudgetPeriod;
}>();

const sectionTitle = {
    daily: "Daily",
    weekly: "Weekly",
    monthly: "Monthly",
    yearly: "Yearly",
}[props.period];

// Per-section reference cursor (component state): 0 = current period, negative = past.
const offset = ref(0);
const atCurrent = computed(() => offset.value === 0);

const { data, isLoading, isFetching, error } = useGetBudgetPeriodSummary(props.period, offset);

const budgets = computed(() => data.value?.budgets ?? []);

const goPrev = () => {
    offset.value -= 1;
};
const goNext = () => {
    if (offset.value < 0) offset.value += 1;
};
const reset = () => {
    offset.value = 0;
};
</script>

<template>
    <!-- title feeds SectionBand's error copy ("Couldn't load monthly budgets."); the visible label is the slot. -->
    <SharedSectionBand
        :title="`${sectionTitle} budgets`"
        :loading="isLoading"
        :error="error"
        :empty="!budgets.length"
        empty-text="No budgets in this period"
        :refreshing="isFetching && !isLoading"
    >
        <template #label>
            {{ sectionTitle }}
            <template v-if="data">
                &middot;
                <span
                    class="text-surface-900 dark:text-surface-0"
                    aria-live="polite"
                    >{{ budgetWindowLabel(period, data.periodStart, data.periodEnd) }}</span
                >
            </template>
        </template>
        <template #header-extra>
            <BudgetsPeriodStepper
                :period="period"
                :at-current="atCurrent"
                @prev="goPrev"
                @next="goNext"
                @reset="reset"
            />
        </template>
        <BudgetsBudgetList
            :budgets="budgets"
            variant="detail"
            :show-period-tag="false"
            :is-current="atCurrent"
            manageable
        />
    </SharedSectionBand>
</template>
