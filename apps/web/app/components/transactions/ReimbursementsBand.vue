<script setup lang="ts">
import type { ITransactionReimbursementLink, ITransactionResponse } from "@badger/types";
import type { MenuItem } from "primevue/menuitem";
import { useConfirm } from "primevue/useconfirm";
import { reimbursementReceiptLines } from "../../utils/reimbursementReceipt";
import ReimbursementAmountDialog from "./ReimbursementAmountDialog.vue";
import { formatDate } from "./formatters";
import { useReimbursementPicker } from "../../composables/transactions/useReimbursementPicker";
import { useDeleteReimbursement } from "../../composables/transactions/useReimbursements";
import { formatCurrency } from "../../utils/currency";
import { displayAmount, linkActionState } from "../../utils/reimbursement";

/**
 * Detail-page band for an expense ("Reimbursements") or an income ("Pays back").
 * Lists the links on the other side, with an edit-amount and unlink menu per link.
 */
const props = defineProps<{
    transaction: ITransactionResponse;
}>();

const confirm = useConfirm();
const { mutate: deleteReimbursement } = useDeleteReimbursement();
const picker = useReimbursementPicker();
const linkState = computed(() => linkActionState(props.transaction));

const isExpense = computed(() => props.transaction.type === "expense");
const code = computed(() => props.transaction.currency.code);
const links = computed(() => props.transaction.reimbursement?.links ?? []);
const allocated = computed(() => props.transaction.reimbursement?.allocatedActive ?? 0);
const counted = computed(() => Number((props.transaction.amount - allocated.value).toFixed(2)));
const appliedWord = computed(() => (isExpense.value ? "applied" : "allocated"));

const receiptLines = computed(() => reimbursementReceiptLines(props.transaction));
const receiptTotal = computed(() =>
    isExpense.value
        ? { label: "Your share", value: formatCurrency(displayAmount(props.transaction), code.value) }
        : { label: "Counts as income", value: formatCurrency(counted.value, code.value) },
);

const menu = ref();
const selectedLink = ref<ITransactionReimbursementLink | null>(null);
const editLink = ref<ITransactionReimbursementLink | null>(null);
const showEditAmount = ref(false);

const menuItems = computed<MenuItem[]>(() => [
    {
        label: "Edit amount",
        icon: "pi pi-pen-to-square",
        command: () => {
            editLink.value = selectedLink.value;
            showEditAmount.value = true;
        },
    },
    {
        label: "Unlink",
        icon: "pi pi-link",
        command: () => {
            if (selectedLink.value) confirmUnlink(selectedLink.value);
        },
    },
]);

const openMenu = (event: Event, link: ITransactionReimbursementLink) => {
    selectedLink.value = link;
    menu.value?.toggle(event);
};

const confirmUnlink = (link: ITransactionReimbursementLink) => {
    const amountText = formatCurrency(link.amount, code.value);
    confirm.require({
        message: isExpense.value
            ? `Unlink "${link.description}"? ${amountText} comes back into this expense's net amount.`
            : `Unlink "${link.description}"? ${amountText} counts as income again.`,
        header: "Unlink reimbursement",
        icon: "pi pi-exclamation-triangle",
        acceptClass: "p-button-danger",
        accept: () => {
            deleteReimbursement(link.allocationId);
        },
    });
};
</script>

<template>
    <SharedSectionBand :title="isExpense ? 'Reimbursements' : 'Pays back'">
        <template
            v-if="linkState.visible"
            #header-extra
        >
            <span
                v-tooltip.top="linkState.tooltip"
                class="inline-flex"
            >
                <Button
                    :label="linkState.label"
                    icon="pi pi-link"
                    size="small"
                    severity="secondary"
                    outlined
                    :disabled="linkState.disabled"
                    @click="picker.open(transaction.id)"
                />
            </span>
        </template>
        <div class="flex flex-col px-4 pb-4 md:px-0 md:pb-0">
            <p
                v-if="links.length === 0"
                class="m-0 text-sm text-muted-color"
            >
                {{ isExpense ? "Nothing has paid this back yet." : "Not paying back any expenses." }}
            </p>

            <ul
                v-else
                class="m-0 flex list-none flex-col divide-y divide-surface-200 p-0 dark:divide-surface-700"
            >
                <li
                    v-for="link in links"
                    :key="link.allocationId"
                    class="flex items-center gap-3 py-3"
                >
                    <div class="flex min-w-0 flex-1 flex-col gap-0.5">
                        <NuxtLink
                            :to="`/transactions/${link.transactionId}`"
                            class="truncate font-semibold text-primary hover:underline"
                        >
                            {{ link.description }}
                        </NuxtLink>
                        <div class="text-xs text-muted-color">
                            {{ formatDate(link.transactionDate) }}
                            <template v-if="link.amount < link.transactionAmount">
                                &middot; {{ formatCurrency(link.amount, code) }} of
                                {{ formatCurrency(link.transactionAmount, code) }} {{ appliedWord }}
                            </template>
                            <template v-if="!link.active">&middot; inactive (hidden)</template>
                        </div>
                    </div>
                    <div class="shrink-0 font-semibold tabular-nums">{{ formatCurrency(link.amount, code) }}</div>
                    <div class="flex w-10 shrink-0 justify-center">
                        <Button
                            icon="pi pi-ellipsis-v"
                            text
                            rounded
                            severity="secondary"
                            aria-label="Link actions"
                            aria-haspopup="true"
                            @click="openMenu($event, link)"
                        />
                    </div>
                </li>
            </ul>

            <div
                v-if="receiptLines"
                class="border-t border-surface-200 pt-3 dark:border-surface-700"
            >
                <div class="flex gap-3 md:ml-auto md:w-[45%] md:min-w-[16rem] md:max-w-sm">
                    <dl class="m-0 flex min-w-0 flex-1 flex-col gap-1 text-sm">
                        <div
                            v-for="line in receiptLines"
                            :key="line.label"
                            class="flex items-baseline justify-between gap-3"
                        >
                            <dt class="text-muted-color">{{ line.label }}</dt>
                            <dd
                                class="m-0 tabular-nums"
                                :class="line.valueClass"
                            >
                                {{ line.value }}
                            </dd>
                        </div>
                        <div
                            class="mt-1 flex items-baseline justify-between gap-3 border-t border-surface-200 pt-2 dark:border-surface-700"
                        >
                            <dt class="font-semibold">{{ receiptTotal.label }}</dt>
                            <dd class="m-0 text-base font-semibold tabular-nums">{{ receiptTotal.value }}</dd>
                        </div>
                    </dl>
                    <span
                        class="w-10 shrink-0"
                        aria-hidden="true"
                    />
                </div>
            </div>
        </div>

        <Menu
            ref="menu"
            :model="menuItems"
            popup
        />

        <ReimbursementAmountDialog
            v-model:visible="showEditAmount"
            :transaction="transaction"
            :link="editLink"
        />
    </SharedSectionBand>
</template>
