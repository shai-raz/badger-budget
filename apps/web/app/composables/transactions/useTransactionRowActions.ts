import type { ITransactionResponse } from "@badger/types";
import { useTransferActions, MIRROR_ACTION_TOOLTIP } from "./useTransferActions";
import { useReimbursementPicker } from "./useReimbursementPicker";
import { linkMenuItem } from "../../utils/reimbursement";

/**
 * Shared row-actions chrome for transaction lists: the overflow menu model plus
 * the Edit / Apply category rule / Mark Card Payoff modal state and handlers. Extracted so
 * every transaction list (the Transactions page's `ListRows.vue`, the budget detail page)
 * drives identical behavior without duplicating logic.
 */
export function useTransactionRowActions() {
    const showEditModal = ref(false);
    const showApplyRuleModal = ref(false);
    const showMarkCardPayoffModal = ref(false);
    const selectedTransaction = ref<ITransactionResponse | null>(null);
    const menu = ref();

    const { menuItems: transferMenuItems } = useTransferActions(selectedTransaction);
    const picker = useReimbursementPicker();

    /** Link / mark-as-reimbursement item; empty for transfers and cash-wallet mirrors. */
    const linkMenuItems = computed(() => {
        const tx = selectedTransaction.value;
        const item = tx ? linkMenuItem(tx, () => picker.open(tx.id)) : null;
        return item ? [item] : [];
    });

    const menuItems = computed(() => {
        const lock = selectedTransaction.value?.counterpartOfId
            ? { disabled: true, tooltip: MIRROR_ACTION_TOOLTIP }
            : {};
        return [
            {
                label: "Edit",
                icon: "pi pi-pen-to-square",
                command: () => {
                    showEditModal.value = true;
                },
            },
            {
                label: "Apply category rule",
                icon: "pi pi-bolt",
                command: () => (showApplyRuleModal.value = true),
                ...lock,
            },
            {
                label: "Mark as Credit Card Payment",
                icon: "pi pi-credit-card",
                command: () => {
                    showMarkCardPayoffModal.value = true;
                },
                ...lock,
            },
            ...linkMenuItems.value,
            ...transferMenuItems.value,
        ];
    });

    /** Open the overflow menu anchored to the click event for a given row. */
    const openMenu = (event: Event, transaction: ITransactionResponse) => {
        selectedTransaction.value = transaction;
        menu.value?.toggle(event);
    };

    /** Swap the Edit dialog for the Apply category rule dialog, for the same row. */
    const openApplyRuleFromEdit = async (tx: ITransactionResponse) => {
        selectedTransaction.value = tx;
        showEditModal.value = false;
        await nextTick();
        showApplyRuleModal.value = true;
    };

    /** Open the Edit Transaction dialog directly for a given row. */
    const openEdit = (transaction: ITransactionResponse) => {
        selectedTransaction.value = transaction;
        showEditModal.value = true;
    };

    return {
        menu,
        menuItems,
        selectedTransaction,
        showEditModal,
        showApplyRuleModal,
        showMarkCardPayoffModal,
        openMenu,
        openEdit,
        openApplyRuleFromEdit,
    };
}
