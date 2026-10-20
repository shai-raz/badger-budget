<script setup lang="ts">
import type { BudgetAnalytics } from "@badger/types";
import { resolveComponent } from "vue";
import { BUDGET_LEVEL_TEXT_CLASS, budgetDaysLeftLabel, budgetPeriodLabel, budgetProgressLevel } from "~/utils/budget";
import { formatCurrencyRounded } from "~/utils/currency";

/**
 * One budget row, shared by the Overview section and the Budgets list. It renders two layouts
 * and the parent list shows one at each breakpoint: at md+ the row is a subgrid item whose cells
 * line up with BudgetList's grid; below md it is a stacked card. Each layout is hidden at the other
 * breakpoint, so the row needs no knowledge of which wrapper it sits in.
 */
const props = withDefaults(
    defineProps<{
        budget: BudgetAnalytics;
        variant?: "summary" | "detail";
        showPeriodTag?: boolean;
        // Whether this budget's window is the in-progress one. Only then does "days left" apply.
        isCurrent?: boolean;
        // Shows the ⋮ button; the parent owns the menu it opens.
        manageable?: boolean;
    }>(),
    { variant: "summary", showPeriodTag: true, isCurrent: true, manageable: false },
);

const emit = defineEmits<{
    menuToggle: [payload: { budget: BudgetAnalytics; event: Event }];
}>();

// A string tag ("NuxtLink") would render an unknown <nuxtlink> element, so resolve the component itself.
const LinkTag = resolveComponent("NuxtLink");

const isDetail = computed(() => props.variant === "detail");
const isOver = computed(() => props.budget.isOverBudget);
const currency = computed(() => props.budget.currencyDisplay?.code);
const percentLabel = computed(() => Math.round(props.budget.percentageUsed));
const percentClass = computed(() => BUDGET_LEVEL_TEXT_CLASS[budgetProgressLevel(props.budget.percentageUsed)]);
const amountClass = computed(() => (isOver.value ? "text-rose-500" : ""));

const meta = computed(() => {
    const daysLeft = props.isCurrent ? budgetDaysLeftLabel(props.budget.periodEnd) : "";
    if (!isDetail.value) return daysLeft;
    const count = `${props.budget.transactionCount} transactions`;
    return daysLeft ? `${count} · ${daysLeft}` : count;
});

const handleMenu = (event: Event) => emit("menuToggle", { budget: props.budget, event });
</script>

<template>
    <component
        :is="budget.existsInPeriod ? LinkTag : 'div'"
        v-bind="budget.existsInPeriod ? { to: `/budgets/${budget.budgetId}` } : {}"
        class="block px-4 py-3 md:grid md:grid-cols-subgrid md:col-span-full md:items-center md:gap-x-4 md:border-b md:border-surface-200 md:px-0 md:last:border-b-0 md:dark:border-surface-700"
    >
        <!-- Mobile -->
        <div class="flex flex-col gap-2 md:hidden">
            <div class="flex items-center justify-between gap-3">
                <div class="flex min-w-0 items-center gap-2">
                    <span class="truncate font-medium">{{ budget.budgetName }}</span>
                    <i
                        v-if="isOver"
                        class="pi pi-exclamation-circle text-rose-500"
                    ></i>
                    <SharedStatusTag
                        v-if="showPeriodTag"
                        :value="budgetPeriodLabel(budget.period)"
                    />
                </div>
                <div class="flex shrink-0 items-center gap-2">
                    <span
                        v-if="budget.existsInPeriod"
                        class="whitespace-nowrap text-right"
                        :class="amountClass"
                    >
                        <template v-if="isOver">
                            Over by
                            <span class="font-bold">{{
                                formatCurrencyRounded(budget.totalSpent - budget.amount, currency)
                            }}</span>
                        </template>
                        <template v-else>
                            <span class="font-bold">{{ formatCurrencyRounded(budget.totalSpent, currency) }}</span>
                            of {{ formatCurrencyRounded(budget.amount, currency) }}
                        </template>
                        <span
                            v-if="isDetail && !isOver"
                            class="block text-teal-600"
                        >
                            {{ formatCurrencyRounded(budget.remaining, currency) }} left
                        </span>
                    </span>
                    <Button
                        v-if="manageable"
                        icon="pi pi-ellipsis-v"
                        text
                        rounded
                        size="small"
                        aria-label="Budget actions"
                        @click.stop.prevent="handleMenu"
                    />
                </div>
            </div>
            <template v-if="budget.existsInPeriod">
                <BudgetsBudgetProgressBar :percentage="budget.percentageUsed" />
                <p
                    v-if="meta"
                    class="text-xs text-muted-color"
                >
                    {{ meta }}
                </p>
            </template>
            <p
                v-else
                class="text-xs text-muted-color"
            >
                Not active in this period
            </p>
        </div>

        <!-- Desktop: one cell per column of BudgetList's grid. -->
        <div class="hidden min-w-0 max-w-[16rem] md:block">
            <div class="flex items-center gap-2">
                <span class="truncate font-medium">{{ budget.budgetName }}</span>
                <i
                    v-if="isOver"
                    class="pi pi-exclamation-circle text-rose-500"
                ></i>
                <SharedStatusTag
                    v-if="showPeriodTag"
                    :value="budgetPeriodLabel(budget.period)"
                />
            </div>
            <p
                v-if="budget.existsInPeriod && meta"
                class="text-xs text-muted-color"
            >
                {{ meta }}
            </p>
        </div>
        <div class="hidden md:block">
            <BudgetsBudgetProgressBar
                v-if="budget.existsInPeriod"
                :percentage="budget.percentageUsed"
            />
            <span
                v-else
                class="text-muted-color"
            >
                Not active in this period
            </span>
        </div>
        <span
            class="hidden whitespace-nowrap text-right md:block"
            :class="percentClass"
        >
            <template v-if="budget.existsInPeriod">{{ percentLabel }}%</template>
        </span>
        <span
            class="hidden whitespace-nowrap text-right md:block"
            :class="amountClass"
        >
            <template v-if="budget.existsInPeriod">
                <template v-if="isOver">
                    Over by
                    <span class="font-bold">{{
                        formatCurrencyRounded(budget.totalSpent - budget.amount, currency)
                    }}</span>
                </template>
                <template v-else>
                    <span class="font-bold">{{ formatCurrencyRounded(budget.totalSpent, currency) }}</span>
                    of {{ formatCurrencyRounded(budget.amount, currency) }}
                </template>
                <span
                    v-if="isDetail && !isOver"
                    class="block text-teal-600"
                >
                    {{ formatCurrencyRounded(budget.remaining, currency) }} left
                </span>
            </template>
        </span>
        <div
            v-if="manageable"
            class="hidden md:block"
        >
            <Button
                icon="pi pi-ellipsis-v"
                text
                rounded
                size="small"
                aria-label="Budget actions"
                @click.stop.prevent="handleMenu"
            />
        </div>
    </component>
</template>
