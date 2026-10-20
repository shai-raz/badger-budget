<script setup lang="ts">
import type { BudgetAnalytics } from "@badger/types";
import { useBudgetFormDialog } from "~/composables/useBudgetFormDialog";
import { useDeleteBudget } from "~/composables/useBudgets";

const props = withDefaults(
    defineProps<{
        budgets: BudgetAnalytics[];
        variant?: "summary" | "detail";
        showPeriodTag?: boolean;
        isCurrent?: boolean;
        // Adds the ⋮ column and the Edit/Delete menu. Off on Overview.
        manageable?: boolean;
    }>(),
    { variant: "summary", showPeriodTag: true, isCurrent: true, manageable: false },
);

const confirm = useConfirm();
const toast = useToast();
const { openEdit } = useBudgetFormDialog();
const deleteMutation = useDeleteBudget();

// One menu for the whole list: the row hands over its click event and the budget it belongs to.
const menu = ref();
const selected = ref<BudgetAnalytics | null>(null);

const menuItems = computed(() => {
    const budget = selected.value;
    if (!budget) return [];
    return [
        { label: "Edit", icon: "pi pi-pencil", command: () => openEdit(budget.budgetId) },
        { label: "Delete", icon: "pi pi-trash", command: () => confirmDelete(budget) },
    ];
});

const handleMenuToggle = ({ budget, event }: { budget: BudgetAnalytics; event: Event }) => {
    selected.value = budget;
    menu.value?.toggle(event);
};

const confirmDelete = (budget: BudgetAnalytics) => {
    confirm.require({
        header: "Delete budget",
        message: "Delete this budget? This can't be undone.",
        acceptClass: "p-button-danger",
        acceptLabel: "Delete",
        rejectLabel: "Cancel",
        accept: async () => {
            try {
                await deleteMutation.mutateAsync(budget.budgetId);
            } catch {
                toast.add({ severity: "error", summary: "Error", detail: "Could not delete the budget", life: 5000 });
            }
        },
    });
};

// Each row is a subgrid item, so every row's cells share the tracks defined here: name sized to its
// widest content (capped and truncated), bar to the remaining space, %/amount to their content.
// Rows are rendered twice (desktop grid, mobile list) because the two layouts differ; each wrapper
// is shown at one breakpoint only.
const gridColumns = computed(
    () => `minmax(0, max-content) 1fr max-content max-content${props.manageable ? " max-content" : ""}`,
);
</script>

<template>
    <div
        class="hidden md:grid md:gap-x-4"
        :style="{ gridTemplateColumns: gridColumns }"
    >
        <BudgetsBudgetRow
            v-for="budget in budgets"
            :key="budget.budgetId"
            :budget="budget"
            :variant="variant"
            :show-period-tag="showPeriodTag"
            :is-current="isCurrent"
            :manageable="manageable"
            @menu-toggle="handleMenuToggle"
        />
    </div>

    <div class="divide-y divide-surface-200 md:hidden dark:divide-surface-700">
        <BudgetsBudgetRow
            v-for="budget in budgets"
            :key="budget.budgetId"
            :budget="budget"
            :variant="variant"
            :show-period-tag="showPeriodTag"
            :is-current="isCurrent"
            :manageable="manageable"
            @menu-toggle="handleMenuToggle"
        />
    </div>

    <Menu
        v-if="manageable"
        ref="menu"
        :model="menuItems"
        popup
    />
</template>
