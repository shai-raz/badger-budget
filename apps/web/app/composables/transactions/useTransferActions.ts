import type { Ref } from "vue";
import type { ITransactionResponse } from "@badger/types";
import { useToast } from "primevue/usetoast";
import { getApiErrorMessage } from "../../utils/apiError";
import { useUpdateTransactionMutation } from "./useUpdateTransaction.mutation";

/** Tooltip on actions that are disabled because the row mirrors a linked transfer. */
export const MIRROR_ACTION_TOOLTIP = "Follows a linked transfer. Change the source transaction instead.";

/**
 * Menu items for re-typing a transaction as a transfer (and back) and for
 * toggling its hidden flag. Direction is derived from the current bucket:
 * an expense is money leaving (out), an income is money entering (in).
 */
export function useTransferActions(transaction: Ref<ITransactionResponse | null | undefined>) {
    const { mutate: updateTransaction, isPending } = useUpdateTransactionMutation();
    const toast = useToast();

    const showError = (error: unknown) => {
        toast.add({
            severity: "error",
            summary: "Error",
            detail: getApiErrorMessage(error, "Failed to update transaction"),
            life: 5000,
        });
    };

    const showSuccess = (detail: string) => {
        toast.add({ severity: "success", summary: "Transaction Updated", detail, life: 3000 });
    };

    const markAsTransfer = () => {
        const current = transaction.value;
        if (!current || current.counterpartOfId || current.type === "transfer") return;

        updateTransaction(
            {
                id: current.id,
                data: { type: "transfer", transferDirection: current.type === "expense" ? "out" : "in" },
            },
            {
                onSuccess: () => showSuccess("Marked as a transfer — excluded from income and expense totals"),
                onError: showError,
            },
        );
    };

    const revertTransfer = () => {
        const current = transaction.value;
        if (!current || current.counterpartOfId || current.type !== "transfer") return;

        // Reverting also unhides: pattern-matched transfers are created hidden,
        // and a reverted expense/income should be a normal, visible row.
        updateTransaction(
            {
                id: current.id,
                data: { type: current.transferDirection === "in" ? "income" : "expense", hidden: false },
            },
            {
                onSuccess: () =>
                    showSuccess(
                        current.counterpart
                            ? `Reverted to a regular transaction; the linked entry on ${current.counterpart.accountName} was removed`
                            : "Reverted to a regular transaction",
                    ),
                onError: showError,
            },
        );
    };

    const toggleHidden = () => {
        const current = transaction.value;
        if (!current || current.counterpartOfId) return;

        const hidden = !current.hidden;
        updateTransaction(
            { id: current.id, data: { hidden } },
            {
                onSuccess: () =>
                    showSuccess(hidden ? "Hidden from the transaction list" : "Visible in the transaction list"),
                onError: showError,
            },
        );
    };

    const menuItems = computed(() => {
        const current = transaction.value;
        if (!current) return [];

        const lock = current.counterpartOfId ? { disabled: true, tooltip: MIRROR_ACTION_TOOLTIP } : {};

        return [
            current.type !== "transfer"
                ? { label: "Mark as Transfer", icon: "pi pi-sync", command: markAsTransfer, ...lock }
                : { label: "Revert Transfer", icon: "pi pi-undo", command: revertTransfer, ...lock },
            current.hidden
                ? { label: "Unhide", icon: "pi pi-eye", command: toggleHidden, ...lock }
                : { label: "Hide", icon: "pi pi-eye-slash", command: toggleHidden, ...lock },
        ];
    });

    return { menuItems, isPending };
}
