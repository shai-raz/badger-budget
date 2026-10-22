<script setup lang="ts">
import type { ITransactionReimbursementLink, ITransactionResponse } from "@badger/types";
import type { MenuItem } from "primevue/menuitem";
import { useConfirm } from "primevue/useconfirm";
import ReimbursementAmountDialog from "./ReimbursementAmountDialog.vue";
import { formatDate } from "./formatters";
import { useDeleteReimbursement } from "../../composables/transactions/useReimbursements";
import { formatCurrency } from "../../utils/currency";
import { displayAmount } from "../../utils/reimbursement";

/**
 * Detail-page band for an expense ("Reimbursements") or an income ("Pays back").
 * Lists the links on the other side, with an edit-amount and unlink menu per link.
 */
const props = defineProps<{
    transaction: ITransactionResponse;
}>();

const confirm = useConfirm();
const { mutate: deleteReimbursement } = useDeleteReimbursement();

const isExpense = computed(() => props.transaction.type === "expense");
const code = computed(() => props.transaction.currency.code);
const links = computed(() => props.transaction.reimbursement?.links ?? []);
const allocated = computed(() => props.transaction.reimbursement?.allocatedActive ?? 0);
const counted = computed(() => Number((props.transaction.amount - allocated.value).toFixed(2)));
const appliedWord = computed(() => (isExpense.value ? "applied" : "allocated"));

const figures = computed(() => [
    { label: "Paid", value: formatCurrency(props.transaction.amount, code.value) },
    { label: "Paid back", value: formatCurrency(allocated.value, code.value) },
    { label: "Your share", value: formatCurrency(displayAmount(props.transaction), code.value) },
]);

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
        <div class="flex flex-col px-4 pb-4 md:px-0 md:pb-0">
            <dl
                v-if="isExpense"
                class="m-0 grid grid-cols-3 gap-3 pb-4"
            >
                <div
                    v-for="figure in figures"
                    :key="figure.label"
                    class="flex min-w-0 flex-col gap-1"
                >
                    <dt class="text-xs text-muted-color">{{ figure.label }}</dt>
                    <dd class="m-0 font-semibold tabular-nums">{{ figure.value }}</dd>
                </div>
            </dl>

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
                    <div class="font-semibold tabular-nums">{{ formatCurrency(link.amount, code) }}</div>
                    <Button
                        icon="pi pi-ellipsis-v"
                        text
                        rounded
                        severity="secondary"
                        aria-label="Link actions"
                        aria-haspopup="true"
                        @click="openMenu($event, link)"
                    />
                </li>
            </ul>

            <p
                v-if="!isExpense"
                class="m-0 border-t border-surface-200 pt-3 text-sm dark:border-surface-700"
            >
                Counts as income:
                <span class="font-semibold tabular-nums">{{ formatCurrency(counted, code) }}</span>
            </p>
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
