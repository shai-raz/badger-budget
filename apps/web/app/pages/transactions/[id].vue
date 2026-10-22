<script setup lang="ts">
import type { ITransactionResponse } from "@badger/types";
import { DEFAULT_CATEGORY_AVATAR_ICON } from "@badger/shared-data";
import type { MenuItem } from "primevue/menuitem";
import { useConfirm } from "primevue/useconfirm";
import EditTransactionDialog from "~/components/transactions/EditTransactionDialog.vue";
import ApplyCategoryRuleDialog from "~/components/transactions/ApplyCategoryRuleDialog.vue";
import MarkCardPayoff from "~/components/transactions/MarkCardPayoff.vue";
import ReimbursementsBand from "~/components/transactions/ReimbursementsBand.vue";
import {
    formatDate,
    transactionSign,
    transactionAmountClass,
    transactionTypeLabel,
    transactionTypeSeverity,
} from "~/components/transactions/formatters";
import { budgetPeriodLabel } from "~/utils/budget";
import { formatCurrency } from "~/utils/currency";
import { useGetTransaction, useDeleteTransaction } from "~/composables/transactions/useTransactions";
import { useTransferActions, MIRROR_ACTION_TOOLTIP } from "~/composables/transactions/useTransferActions";

definePageMeta({
    layout: "app",
    fullBleed: true,
});

const route = useRoute();
const router = useRouter();
const confirm = useConfirm();

const transactionId = computed(() => route.params.id as string);

const { data: transaction, isLoading, error } = useGetTransaction(transactionId);
const deleteMutation = useDeleteTransaction();

const showEditModal = ref(false);
const showApplyRuleModal = ref(false);
const showMarkCardPayoffModal = ref(false);

const ruleTransaction = ref<ITransactionResponse | null>(null);
watch(showApplyRuleModal, (v) => {
    if (!v) ruleTransaction.value = null;
});

const openApplyRuleFromEdit = async (tx: ITransactionResponse) => {
    ruleTransaction.value = tx;
    showEditModal.value = false;
    await nextTick();
    showApplyRuleModal.value = true;
};

const { menuItems: transferMenuItems } = useTransferActions(transaction);

const isMirror = computed(() => !!transaction.value?.counterpartOfId);
const mirrorLock = computed(() => (isMirror.value ? { disabled: true, tooltip: MIRROR_ACTION_TOOLTIP } : {}));

const menuItems = computed<MenuItem[]>(() => [
    {
        label: "Apply category rule",
        icon: "pi pi-bolt",
        command: () => {
            showApplyRuleModal.value = true;
        },
        ...mirrorLock.value,
    },
    {
        label: "Mark as Credit Card Payment",
        icon: "pi pi-credit-card",
        command: () => {
            showMarkCardPayoffModal.value = true;
        },
        ...mirrorLock.value,
    },
    ...transferMenuItems.value,
    { separator: true },
    {
        label: "Delete",
        icon: "pi pi-trash",
        command: () => {
            handleDelete();
        },
        ...(isMirror.value
            ? {
                  disabled: true,
                  tooltip: "This entry follows a linked transfer. Delete the source transaction instead.",
              }
            : {}),
    },
]);

const typeTone = computed(() => (transaction.value ? transactionTypeSeverity(transaction.value) : "danger"));

const amountClass = computed(() => (transaction.value ? transactionAmountClass(transaction.value) : ""));

const formattedAmount = computed(() => {
    if (!transaction.value) return "";
    const sign = transactionSign(transaction.value);
    return `${sign}${formatCurrency(transaction.value.amount, transaction.value.currency.code)}`;
});

const applicableBudgets = computed(() => transaction.value?.applicableBudgets ?? []);

const { data: currencies } = useGetCurrencies();

const counterpartLink = computed(() => {
    const cp = transaction.value?.counterpart;
    if (!cp || !transaction.value) return null;
    const code = currencies.value?.find((c) => c.id === cp.currencyId)?.code;
    return {
        to: `/transactions/${cp.id}`,
        label: transaction.value.transferDirection === "in" ? "From account" : "To account",
        text: `${cp.accountName} · ${code ? formatCurrency(cp.amount, code) : cp.amount}`,
    };
});

const handleDelete = () => {
    if (isMirror.value) return;
    confirm.require({
        message: "Are you sure you want to delete this transaction? This action cannot be undone.",
        header: "Delete transaction",
        icon: "pi pi-exclamation-triangle",
        acceptClass: "p-button-danger",
        accept: async () => {
            try {
                await deleteMutation.mutateAsync(transactionId.value);
                router.push("/transactions");
            } catch (deleteError) {
                console.error("Error deleting transaction:", deleteError);
            }
        },
    });
};
</script>

<template>
    <div>
        <LayoutPageHeader
            title="Transaction"
            back-to="/transactions"
            :overflow-items="menuItems"
        >
            <template #actions>
                <LayoutHeaderButton
                    label="Edit"
                    icon="pi pi-pen-to-square"
                    aria-label="Edit transaction"
                    :disabled="!transaction"
                    @click="showEditModal = true"
                />
            </template>
        </LayoutPageHeader>

        <ProgressSpinner v-if="isLoading" />

        <Message
            v-else-if="error || !transaction"
            severity="error"
            class="mx-4 md:mx-0"
            >Error loading transaction</Message
        >

        <div
            v-else
            class="flex flex-col gap-3 pb-8 md:gap-6"
        >
            <SharedSectionBand title="Overview">
                <div
                    class="flex flex-col items-center gap-3 px-4 pb-4 text-center md:flex-row md:items-center md:gap-5 md:px-0 md:pb-0 md:text-left"
                >
                    <SharedEntityAvatar
                        :icon="transaction.category?.icon"
                        :color="transaction.category?.color"
                        :fallback="DEFAULT_CATEGORY_AVATAR_ICON"
                        size="lg"
                    />
                    <div class="flex min-w-0 flex-col items-center gap-2 md:items-start">
                        <h2 class="text-xl leading-tight font-semibold break-words">{{ transaction.description }}</h2>
                        <div
                            class="text-3xl leading-none font-bold tabular-nums"
                            :class="amountClass"
                        >
                            {{ formattedAmount }}
                        </div>
                        <div class="flex flex-wrap items-center justify-center gap-2 md:justify-start">
                            <SharedCategoryChip
                                :name="transaction.category?.name || 'Uncategorized'"
                                :color="transaction.category?.color"
                            />
                            <SharedStatusTag
                                :value="transactionTypeLabel(transaction.type)"
                                :tone="typeTone"
                            />
                            <i
                                v-if="transaction.hidden"
                                v-tooltip.top="'Hidden'"
                                class="pi pi-eye-slash text-muted-color"
                            />
                        </div>
                        <div class="text-sm text-muted-color">
                            {{ formatDate(transaction.transactionDate) }} &middot; {{ transaction.account.name }}
                        </div>
                    </div>
                </div>
            </SharedSectionBand>

            <Message
                v-if="transaction.type === 'transfer'"
                class="mx-4 md:mx-0"
                severity="info"
                icon="pi pi-sync"
                :closable="false"
            >
                Transfer between your own accounts — excluded from income and expense totals and from budget usage.
                <template v-if="transaction.hidden">Hidden from the transaction list.</template>
            </Message>

            <div class="flex flex-col gap-3 md:grid md:grid-cols-[1.55fr_1fr] md:items-start md:gap-6">
                <div class="flex min-w-0 flex-col gap-3 md:gap-6">
                    <SharedSectionBand title="Details">
                        <div class="flex flex-col px-4 pb-4 md:px-0 md:pb-0">
                            <SharedDetailRow label="Date">
                                {{ formatDate(transaction.transactionDate) }}
                            </SharedDetailRow>

                            <SharedDetailRow
                                label="Account"
                                icon="pi pi-credit-card"
                            >
                                {{ transaction.account.name }}
                                <template v-if="transaction.account.accountNumber">
                                    &nbsp;&bull;&bull;{{ transaction.account.accountNumber.slice(-4) }}
                                </template>
                            </SharedDetailRow>

                            <SharedDetailRow
                                v-if="transaction.counterpartOf"
                                label="Linked from"
                            >
                                <NuxtLink
                                    :to="`/transactions/${transaction.counterpartOf.id}`"
                                    class="text-primary hover:underline"
                                >
                                    {{ transaction.counterpartOf.description }} &middot;
                                    {{ transaction.counterpartOf.accountName }}
                                </NuxtLink>
                            </SharedDetailRow>

                            <SharedDetailRow
                                v-if="counterpartLink"
                                :label="counterpartLink.label"
                            >
                                <NuxtLink
                                    :to="counterpartLink.to"
                                    class="text-primary hover:underline"
                                >
                                    {{ counterpartLink.text }}
                                </NuxtLink>
                            </SharedDetailRow>

                            <SharedDetailRow label="Category">
                                {{ transaction.category?.name || "Uncategorized" }}
                            </SharedDetailRow>

                            <SharedDetailRow
                                v-if="applicableBudgets.length > 0"
                                label="Counts toward budgets"
                            >
                                <SharedStatusTag
                                    v-for="budget in applicableBudgets"
                                    :key="budget.id"
                                    :value="`${budget.name} · ${budgetPeriodLabel(budget.period)}`"
                                />
                            </SharedDetailRow>

                            <SharedDetailRow
                                v-if="transaction.paymentType"
                                label="Payment method"
                            >
                                <span class="capitalize">{{ transaction.paymentType }}</span>
                            </SharedDetailRow>

                            <SharedDetailRow
                                v-if="transaction.externalId"
                                label="Reference"
                            >
                                <span class="font-mono text-xs">{{ transaction.externalId }}</span>
                            </SharedDetailRow>

                            <SharedDetailRow
                                v-if="transaction.additionalDescription"
                                label="Additional description"
                            >
                                {{ transaction.additionalDescription }}
                            </SharedDetailRow>

                            <SharedDetailRow
                                v-if="transaction.originalAmount != null && transaction.originalCurrency"
                                label="Original amount"
                            >
                                {{ formatCurrency(transaction.originalAmount, transaction.originalCurrency.code) }}
                            </SharedDetailRow>

                            <SharedDetailRow
                                v-if="transaction.originalCategory"
                                label="Original category"
                            >
                                {{ transaction.originalCategory }}
                            </SharedDetailRow>

                            <div
                                v-if="transaction.notes"
                                class="pt-3 mt-1 border-t border-surface-200 dark:border-surface-700"
                            >
                                <div class="text-xs uppercase tracking-wider text-muted-color mb-1">Notes</div>
                                <div class="text-sm leading-relaxed">{{ transaction.notes }}</div>
                            </div>
                        </div>
                    </SharedSectionBand>

                    <ReimbursementsBand
                        v-if="transaction.type === 'expense' || transaction.type === 'income'"
                        :transaction="transaction"
                    />
                </div>

                <!-- Attachments -->
                <div class="md:sticky md:top-4">
                    <TransactionsAttachmentsCard :transaction="transaction" />
                </div>
            </div>
        </div>

        <EditTransactionDialog
            v-model:visible="showEditModal"
            :transaction="transaction ?? null"
            @create-rule="openApplyRuleFromEdit"
        />
        <ApplyCategoryRuleDialog
            v-model:visible="showApplyRuleModal"
            :transaction="ruleTransaction ?? transaction ?? null"
        />
        <MarkCardPayoff
            v-model:visible="showMarkCardPayoffModal"
            :transaction="transaction ?? null"
        />
    </div>
</template>
