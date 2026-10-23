import { formatCurrency } from "./currency";
import type { ReimbursementTx } from "./reimbursement";

export interface ReimbursementReceiptLine {
    label: string;
    value: string;
    valueClass: string;
}

/** The plain receipt lines above the band's emphasised total; null when there is nothing to show. */
export function reimbursementReceiptLines(tx: ReimbursementTx): ReimbursementReceiptLine[] | null {
    if (tx.type !== "expense" && tx.type !== "income") return null;
    if (!tx.reimbursement?.links?.length) return null;

    const code = tx.currency.code;
    const applied = `−${formatCurrency(tx.reimbursement.allocatedActive ?? 0, code)}`;

    if (tx.type === "expense") {
        return [
            { label: "Paid", value: formatCurrency(tx.amount, code), valueClass: "" },
            { label: "Paid back", value: applied, valueClass: "text-teal-500" },
        ];
    }

    return [
        { label: "Received", value: formatCurrency(tx.amount, code), valueClass: "" },
        { label: "Applied", value: applied, valueClass: "text-muted-color" },
    ];
}
