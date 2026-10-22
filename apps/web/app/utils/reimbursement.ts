import type { ITransactionResponse } from "@badger/types";
import { transactionAmountClass } from "../components/transactions/formatters";
import { formatCurrency } from "./currency";

/**
 * Display helpers for reimbursement links. Money is worked in whole cents
 * internally so sums and differences never drift by a fraction of a unit.
 */

export type ReimbursementTx = Pick<
    ITransactionResponse,
    "type" | "amount" | "hidden" | "reimbursement" | "transferDirection"
> & { currency: { code: string } };

const toCents = (amount: number) => Math.round(amount * 100);
const fromCents = (cents: number) => cents / 100;

const allocatedActive = (tx: ReimbursementTx) => tx.reimbursement?.allocatedActive ?? 0;

/** Expense: amount minus its active reimbursements (net). Anything else: the full amount. */
export function displayAmount(tx: ReimbursementTx): number {
    if (tx.type !== "expense") return tx.amount;
    return fromCents(Math.max(0, toCents(tx.amount) - toCents(allocatedActive(tx))));
}

/** An income that currently pays back at least one active expense. */
export function isAllocatedIncome(tx: ReimbursementTx): boolean {
    return tx.type === "income" && allocatedActive(tx) > 0;
}

/** Allocated incomes render muted; everything else keeps the normal sign colour. */
export function rowAmountClass(tx: ReimbursementTx): string {
    return isAllocatedIncome(tx) ? "text-muted-color" : transactionAmountClass(tx);
}

/** Secondary line under a row that has active reimbursements. Null when there is nothing to say. */
export function reimbursementSubLine(tx: ReimbursementTx): string | null {
    const code = tx.currency.code;

    if (tx.type === "expense") {
        const backed = allocatedActive(tx);
        if (backed <= 0) return null;
        return `↩ ${formatCurrency(backed, code)} of ${formatCurrency(tx.amount, code)} back`;
    }

    if (tx.type === "income") {
        const active = (tx.reimbursement?.links ?? []).filter((link) => link.active);
        const [first] = active;
        if (!first) return null;
        if (active.length === 1) return `reimburses ${first.description}`;
        return `${formatCurrency(allocatedActive(tx), code)} reimburses ${active.length} expenses`;
    }

    return null;
}

/** Under an allocated income: the part that still counts as income. Null when fully allocated. */
export function incomeRemainderLine(tx: ReimbursementTx): string | null {
    if (!isAllocatedIncome(tx)) return null;
    const remainder = fromCents(Math.max(0, toCents(tx.amount) - toCents(allocatedActive(tx))));
    if (remainder <= 0) return null;
    return `${formatCurrency(remainder, tx.currency.code)} income`;
}

/**
 * How much of the row can still be linked. Uses every link, not only the
 * active ones, so an inactive link still counts against the cap.
 */
export function remainingToLink(tx: ReimbursementTx): number {
    return fromCents(Math.max(0, toCents(tx.amount) - toCents(tx.reimbursement?.allocatedTotal ?? 0)));
}

export interface LinkActionState {
    visible: boolean;
    label: string;
    disabled: boolean;
    tooltip?: string;
}

/**
 * The "Link reimbursement" / "Mark as reimbursement" action. Transfers,
 * including cash-wallet mirrors, don't get it at all. Hidden rows and rows
 * with nothing left to link keep it visible but disabled, with a reason.
 */
export function linkActionState(tx: ReimbursementTx & { counterpartOfId: string | null }): LinkActionState {
    const isIncome = tx.type === "income";
    const label = isIncome ? "Mark as reimbursement" : "Link reimbursement";

    if (tx.type === "transfer" || tx.counterpartOfId !== null) {
        return { visible: false, label, disabled: true };
    }
    if (tx.hidden) {
        return {
            visible: true,
            label,
            disabled: true,
            tooltip: "Unhide this transaction to link reimbursements",
        };
    }
    if (remainingToLink(tx) <= 0) {
        return {
            visible: true,
            label,
            disabled: true,
            tooltip: isIncome ? "Fully allocated" : "Fully reimbursed",
        };
    }
    return { visible: true, label, disabled: false };
}

/** Default amount when applying a link: whichever side has less left. Cents-exact. */
export function defaultApplyAmount(sourceRemaining: number, candidateRemaining: number): number {
    return fromCents(Math.max(0, Math.min(toCents(sourceRemaining), toCents(candidateRemaining))));
}

/**
 * Warning shown before a card-payoff re-tag that would delete existing links.
 * Null when the preview is missing or no links would be removed.
 */
export function linkRemovalWarning(
    preview: { linkedTransactions: number; links: number } | null | undefined,
): string | null {
    if (!preview || preview.links === 0) return null;
    const n = preview.linkedTransactions;
    if (n === 1) {
        return "1 of these transactions is linked as a reimbursement. Marking it removes that link, and the transaction it's linked to goes back to its full amount.";
    }
    return `${n} of these transactions are linked as reimbursements. Marking them removes those links, and the transactions they're linked to go back to full amounts.`;
}

/** Toast suffix after a re-tag that removed links. Empty when none were removed. */
export function linksRemovedSuffix(linksRemoved: number | undefined): string {
    if (!linksRemoved) return "";
    return ` · ${linksRemoved} reimbursement link${linksRemoved === 1 ? "" : "s"} removed`;
}
