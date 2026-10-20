<script setup lang="ts">
import type { Budget } from "@badger/types";

// fullBleed: below md each budget band spans the full screen width and is separated by its own
// borders, so the layout must not add its usual scroller padding. Desktop is unaffected.
definePageMeta({
    layout: "app",
    fullBleed: true,
});

const { openCreate } = useBudgetFormDialog();
const { data: budgets, isLoading, error } = useGetBudgets();

const PERIOD_ORDER = ["daily", "weekly", "monthly", "yearly"] as const;

const isEmpty = computed(() => !budgets.value || budgets.value.length === 0);

// Only render a band for a period type the user actually has a budget for.
const presentPeriods = computed(() =>
    PERIOD_ORDER.filter((period) => (budgets.value ?? []).some((budget: Budget) => budget.period === period)),
);
</script>

<template>
    <div>
        <LayoutPageHeader title="Budgets">
            <template #actions>
                <LayoutHeaderButton
                    label="New"
                    icon="pi pi-plus"
                    primary
                    aria-label="New budget"
                    @click="openCreate"
                />
            </template>
        </LayoutPageHeader>

        <div class="flex flex-col gap-3 pb-8 md:gap-6">
            <SharedSectionBand
                v-if="isLoading"
                title="Budgets"
                loading
            />

            <SharedSectionBand
                v-else-if="error"
                title="Budgets"
                :error="error"
            />

            <SharedSectionBand
                v-else-if="isEmpty"
                title="Budgets"
            >
                <SharedEmptyState
                    icon="pi-wallet"
                    text="Create your first budget to start tracking your spending"
                    action-label="Create a budget"
                    @action="openCreate"
                />
            </SharedSectionBand>

            <BudgetsBudgetPeriodSection
                v-for="period in presentPeriods"
                :key="period"
                :period="period"
            />
        </div>
    </div>
</template>
