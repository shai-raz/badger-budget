<script setup lang="ts">
import type { ITransactionResponse } from "@badger/types";
import type { MenuItem } from "primevue/menuitem";
import { useGetTransactions } from "../../../composables/transactions/useTransactions";
import TransactionRow from "~/components/transactions/TransactionRow.vue";
import TransactionActionsHost from "~/components/transactions/TransactionActionsHost.vue";
import { formatCurrency } from "~/utils/currency";
import {
    BUDGET_LEVEL_TEXT_CLASS,
    budgetDaysLeftLabel,
    budgetPeriodLabel,
    budgetProgressLevel,
    budgetWindowLabel,
} from "~/utils/budget";

// fullBleed: below md the summary and transactions bands span the full screen width, so the
// layout must not add its usual scroller padding. Desktop is unaffected.
definePageMeta({
    layout: "app",
    fullBleed: true,
});

const route = useRoute();
const router = useRouter();
const { openEdit } = useBudgetFormDialog();
const budgetId = computed(() => route.params.id as string);

// Period cursor for this budget: 0 = current period, negative = past.
const offset = ref(0);
const atCurrent = computed(() => offset.value === 0);

const { data: analytics, isLoading, isFetching, error } = useGetBudgetAnalytics(budgetId, offset);

const goPrev = () => {
    offset.value -= 1;
};
const goNext = () => {
    if (offset.value < 0) offset.value += 1;
};
const resetPeriod = () => {
    offset.value = 0;
};

const {
    data: budgetTransactions,
    isLoading: isLoadingBudgetTransactions,
    error: budgetTransactionsError,
} = useGetTransactions();
const deleteMutation = useDeleteBudget();
const confirm = useConfirm();

const filteredBudgetTransactions = computed<ITransactionResponse[]>(() => {
    if (!analytics.value || !budgetTransactions.value) {
        return [];
    }

    const categoryIds = new Set(analytics.value.categories.map((category) => category.id));
    const periodStart = new Date(analytics.value.periodStart);
    const periodEnd = new Date(analytics.value.periodEnd);

    return budgetTransactions.value.filter((transaction) => {
        if (transaction.type !== "expense" || !transaction.categoryId) {
            return false;
        }

        const transactionDate = new Date(transaction.transactionDate);
        return (
            categoryIds.has(transaction.categoryId) && transactionDate >= periodStart && transactionDate <= periodEnd
        );
    });
});

// Shared overflow menu + Edit / Apply category rule / Mark Card Payoff modals for the rows.
const actionsHost = ref<InstanceType<typeof TransactionActionsHost> | null>(null);

const handleEdit = () => {
    openEdit(budgetId.value);
};

const handleTransactionClick = (transaction: ITransactionResponse) => {
    router.push(`/transactions/${transaction.id}`);
};

const handleMenuToggle = ({ transaction, event }: { transaction: ITransactionResponse; event: Event }) => {
    actionsHost.value?.openMenu(event, transaction);
};

const handleDelete = () => {
    confirm.require({
        message: "Are you sure you want to delete this budget? This action cannot be undone.",
        header: "Delete budget",
        icon: "pi pi-exclamation-triangle",
        acceptClass: "p-button-danger",
        accept: async () => {
            try {
                await deleteMutation.mutateAsync(budgetId.value);
                router.push("/budgets");
            } catch (deleteError) {
                console.error("Error deleting budget:", deleteError);
            }
        },
    });
};

const overflowItems: MenuItem[] = [{ label: "Delete", icon: "pi pi-trash", command: handleDelete }];
</script>

<template>
    <div>
        <LayoutPageHeader
            title="Budget"
            back-to="/budgets"
            :overflow-items="overflowItems"
        >
            <template #actions>
                <LayoutHeaderButton
                    label="Edit"
                    icon="pi pi-pencil"
                    aria-label="Edit budget"
                    @click="handleEdit"
                />
            </template>
        </LayoutPageHeader>

        <div class="flex flex-col gap-3 pb-8 md:gap-6">
            <SharedSectionBand
                :title="analytics ? budgetPeriodLabel(analytics.period) : 'Budget'"
                :loading="isLoading"
                :error="error"
                :refreshing="isFetching && !isLoading"
            >
                <template
                    v-if="analytics"
                    #label
                >
                    {{ budgetPeriodLabel(analytics.period) }}
                    &middot;
                    <span
                        class="text-surface-900 dark:text-surface-0"
                        aria-live="polite"
                        >{{ budgetWindowLabel(analytics.period, analytics.periodStart, analytics.periodEnd) }}</span
                    >
                </template>
                <template
                    v-if="analytics"
                    #header-extra
                >
                    <BudgetsPeriodStepper
                        :period="analytics.period"
                        :at-current="atCurrent"
                        @prev="goPrev"
                        @next="goNext"
                        @reset="resetPeriod"
                    />
                </template>

                <template v-if="analytics">
                    <div class="px-4 pb-3 text-lg font-semibold md:px-0">{{ analytics.budgetName }}</div>

                    <SharedEmptyState
                        v-if="!analytics.existsInPeriod"
                        text="No budget set for this period"
                    />

                    <div
                        v-else
                        class="flex flex-col gap-3 px-4 pb-4 md:px-0 md:pb-0"
                    >
                        <div class="grid grid-cols-3 divide-x divide-surface-200 dark:divide-surface-700">
                            <div class="flex flex-col gap-1 px-3 first:pl-0">
                                <span class="text-[11px] font-semibold uppercase tracking-wide text-muted-color">
                                    Spent
                                </span>
                                <span
                                    class="text-lg font-bold tabular-nums"
                                    :class="BUDGET_LEVEL_TEXT_CLASS[budgetProgressLevel(analytics.percentageUsed)]"
                                >
                                    {{ formatCurrency(analytics.totalSpent, analytics.currencyDisplay?.code) }}
                                </span>
                            </div>
                            <div class="flex flex-col gap-1 px-3">
                                <span class="text-[11px] font-semibold uppercase tracking-wide text-muted-color">
                                    Budget
                                </span>
                                <span class="text-lg font-bold tabular-nums">
                                    {{ formatCurrency(analytics.amount, analytics.currencyDisplay?.code) }}
                                </span>
                            </div>
                            <div class="flex flex-col gap-1 px-3">
                                <span class="text-[11px] font-semibold uppercase tracking-wide text-muted-color">
                                    {{ analytics.isOverBudget ? "Over by" : "Remaining" }}
                                </span>
                                <span
                                    class="text-lg font-bold tabular-nums"
                                    :class="analytics.isOverBudget ? 'text-rose-500' : 'text-teal-500'"
                                >
                                    {{ formatCurrency(Math.abs(analytics.remaining), analytics.currencyDisplay?.code) }}
                                </span>
                            </div>
                        </div>

                        <BudgetsBudgetProgressBar :percentage="analytics.percentageUsed" />

                        <div class="flex flex-wrap items-center gap-x-2 text-sm text-muted-color">
                            <span>{{ analytics.transactionCount }} transactions</span>
                            <span aria-hidden="true">&middot;</span>
                            <span :class="BUDGET_LEVEL_TEXT_CLASS[budgetProgressLevel(analytics.percentageUsed)]">
                                Used {{ analytics.percentageUsed.toFixed(0) }}%
                            </span>
                            <template v-if="atCurrent">
                                <span aria-hidden="true">&middot;</span>
                                <span>{{ budgetDaysLeftLabel(analytics.periodEnd) }}</span>
                            </template>
                        </div>
                    </div>
                </template>
            </SharedSectionBand>

            <SharedSectionBand
                v-if="analytics?.existsInPeriod"
                title="Transactions"
                :meta="`${filteredBudgetTransactions.length}`"
                :loading="isLoadingBudgetTransactions"
                :error="budgetTransactionsError"
                :empty="!filteredBudgetTransactions.length"
                empty-text="No transactions in this budget yet"
            >
                <TransactionRow
                    v-for="transaction in filteredBudgetTransactions"
                    :key="transaction.id"
                    :transaction="transaction"
                    clickable
                    @click="handleTransactionClick"
                    @menu-toggle="handleMenuToggle"
                />
            </SharedSectionBand>
        </div>

        <!-- Overlays only (popup menu + modals, all teleported to body). Kept at the page root, not
             inside the transactions band, so an open dialog survives the band going empty. -->
        <TransactionActionsHost ref="actionsHost" />
    </div>
</template>
