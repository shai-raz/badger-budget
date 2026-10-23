import type { ITransactionReimbursement, ITransactionReimbursementLink } from "@badger/types";

/**
 * Pure reimbursement math. No Nest or Prisma imports: every total, cap and response summary goes through here.
 *
 * Amounts are compared and summed in integer cents so 0.1 + 0.2 is exactly 0.3.
 */

/** Only active rows net against totals: a deleted or hidden side drops its link from netting. */
export const ACTIVE_SIDE = { deletedAt: null, hidden: false } as const;

/** Accepts plain numbers, strings and Prisma Decimal (via Number()). */
export const toCents = (v: unknown): number => Math.round(Number(v) * 100);
export const fromCents = (c: number): number => c / 100;

/** Sum of allocation amounts, returned as a 2-dp number. */
export function sumAllocations(rows: ReadonlyArray<{ amount: unknown }>): number {
    return fromCents(rows.reduce((acc, row) => acc + toCents(row.amount), 0));
}

/** amount − allocated, clamped at 0, cents-exact. */
export function netOf(amount: unknown, allocated: number): number {
    return fromCents(Math.max(0, toCents(amount) - toCents(allocated)));
}

interface SideRow {
    id: string;
    description: string;
    amount: unknown;
    transactionDate: Date;
    hidden: boolean;
    deletedAt: Date | null;
    reimburses?: { amount: unknown }[];
    reimbursedBy?: { amount: unknown }[];
}

/**
 * Builds the reimbursement summary for a transaction row loaded with the include from the transactions service.
 * Returns null for transfers and for rows with no live links.
 */
export function toReimbursementSummary(row: {
    type: string;
    hidden: boolean;
    deletedAt: Date | null;
    reimbursedBy?: Array<{ id: string; amount: unknown; income: SideRow }>;
    reimburses?: Array<{ id: string; amount: unknown; expense: SideRow }>;
}): ITransactionReimbursement | null {
    if (row.type !== "expense" && row.type !== "income") return null;
    const isExpense = row.type === "expense";

    type Link = { id: string; amount: unknown; other: SideRow };
    const rawLinks: Link[] = isExpense
        ? (row.reimbursedBy ?? []).map((link) => ({ id: link.id, amount: link.amount, other: link.income }))
        : (row.reimburses ?? []).map((link) => ({ id: link.id, amount: link.amount, other: link.expense }));

    const links: ITransactionReimbursementLink[] = rawLinks
        .filter((link) => !link.other.deletedAt)
        .map((link) => {
            const other = link.other;
            // The other side's own allocation list: an expense's income side reimburses other things, and vice versa.
            const otherAllocations = isExpense ? other.reimburses : other.reimbursedBy;
            return {
                allocationId: link.id,
                transactionId: other.id,
                description: other.description,
                transactionAmount: fromCents(toCents(other.amount)),
                transactionRemaining: netOf(other.amount, sumAllocations(otherAllocations ?? [])),
                transactionDate: other.transactionDate,
                amount: fromCents(toCents(link.amount)),
                active: !row.hidden && !row.deletedAt && !other.hidden,
            };
        });

    if (links.length === 0) return null;

    const sumLinks = (list: ITransactionReimbursementLink[]) =>
        fromCents(list.reduce((acc, link) => acc + toCents(link.amount), 0));

    return {
        role: isExpense ? "expense" : "income",
        allocatedTotal: sumLinks(links),
        allocatedActive: sumLinks(links.filter((link) => link.active)),
        links,
    };
}
