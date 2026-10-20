<script setup lang="ts">
import { useBudgetFormDialog } from "~/composables/useBudgetFormDialog";
import { useGetBudgetDashboard } from "~/composables/useBudgets";

const { data, isLoading, error } = useGetBudgetDashboard();
const { openCreate } = useBudgetFormDialog();

// Already sorted first by the API — just filter to budgets that exist in the
// current period (others render nothing useful here).
const rows = computed(() => (data.value?.budgets ?? []).filter((budget) => budget.existsInPeriod));

// Built from rows, not the API's totalBudgets/overBudgetCount, since those count
// budgets that haven't started yet (existsInPeriod: false) which rows filters out.
const meta = computed(() => {
    if (!rows.value.length) return undefined;
    const overBudgetCount = rows.value.filter((budget) => budget.isOverBudget).length;
    return `${rows.value.length} active${overBudgetCount > 0 ? ` · ${overBudgetCount} over` : ""}`;
});
</script>

<template>
    <SharedSectionBand
        title="Budgets"
        link-to="/budgets"
        link-label="All budgets"
        :meta="meta"
        :loading="isLoading"
        :error="error"
        :empty="!rows.length"
    >
        <template #skeleton>
            <div class="flex flex-col gap-3 px-4 pb-3 md:px-0 md:pb-0">
                <Skeleton
                    v-for="i in 3"
                    :key="i"
                    height="2.5rem"
                />
            </div>
        </template>

        <template #empty>
            <SharedEmptyState
                text="No budgets yet"
                action-label="Create a budget"
                @action="openCreate"
            />
        </template>

        <BudgetsBudgetList :budgets="rows" />
    </SharedSectionBand>
</template>
