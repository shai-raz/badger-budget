import type { IAccountResponse } from "@badger/types";
import { isLedgerAccountType, type LedgerAccountType } from "@badger/shared-data";

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

const LEDGER_BALANCE_DIALOG_COPY: Record<LedgerAccountType, LedgerBalanceDialogCopy> = {
    cash: CASH_COPY,
    savings: SAVINGS_COPY,
};

/** Copy for the "update balance" dialog of a ledger account. */
export function ledgerBalanceDialogCopy(type: LedgerAccountType): LedgerBalanceDialogCopy {
    return LEDGER_BALANCE_DIALOG_COPY[type];
}

/** The balance to prefill the update dialog with: a ledger account's non-negative balance, else null. */
export function ledgerBalancePrefill(account: Pick<IAccountResponse, "type" | "balance"> | null): number | null {
    if (!account || !isLedgerAccountType(account.type)) return null;
    return account.balance != null && account.balance >= 0 ? account.balance : null;
}
