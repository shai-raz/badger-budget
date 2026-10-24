import type { IAccountResponse } from "@badger/types";
import { isLedgerAccountType } from "@badger/shared-data";

export interface LedgerBalanceDialogCopy {
    header: string;
    label: string;
    help: string;
    successSummary: string;
    errorFallback: string;
}

const SAVINGS_COPY: LedgerBalanceDialogCopy = {
    header: "Update savings balance",
    label: "Current balance",
    help: "We'll record the difference as a savings adjustment (a transfer in or out).",
    successSummary: "Savings balance updated",
    errorFallback: "Could not update the savings balance",
};

const CASH_COPY: LedgerBalanceDialogCopy = {
    header: "Update cash balance",
    label: "Cash in hand",
    help: "We'll record the difference: untracked cash spending if you have less, a cash adjustment if you have more.",
    successSummary: "Cash balance updated",
    errorFallback: "Could not update the cash balance",
};

/** Copy for the "update balance" dialog of a ledger account; cash is the default. */
export function ledgerBalanceDialogCopy(type: string): LedgerBalanceDialogCopy {
    return type === "savings" ? SAVINGS_COPY : CASH_COPY;
}

/** The balance to prefill the update dialog with: a ledger account's non-negative balance, else null. */
export function ledgerBalancePrefill(account: Pick<IAccountResponse, "type" | "balance"> | null): number | null {
    if (!account || !isLedgerAccountType(account.type)) return null;
    return account.balance != null && account.balance >= 0 ? account.balance : null;
}
