import type { Prisma } from "@prisma/client";
import type { PrismaService } from "../prisma/prisma.service";

export interface CashAccountStats {
    balance: number;
    lastTransactionDate: Date;
    hasLinkedTransfers: boolean;
}

/**
 * Computes the cash-on-hand balance for the given accounts from their own non-deleted transactions
 * (hidden included): income and transfers in add, expenses and transfers out subtract (a transfer
 * with a null direction counts as out). Accounts with no rows are absent from the result.
 */
export async function computeCashStats(
    db: Prisma.TransactionClient | PrismaService,
    userId: string,
    accountIds: string[],
): Promise<Map<string, CashAccountStats>> {
    const stats = new Map<string, CashAccountStats>();
    if (accountIds.length === 0) return stats;

    const where = { userId, deletedAt: null, accountId: { in: accountIds } };
    const groups = await db.transaction.groupBy({
        by: ["accountId", "type", "transferDirection"],
        where,
        _sum: { amount: true },
        _max: { transactionDate: true },
    });
    const linked = await db.transaction.groupBy({
        by: ["accountId"],
        where: { ...where, OR: [{ counterpartOfId: { not: null } }, { counterpart: { isNot: null } }] },
        _count: { _all: true },
    });

    const cents = new Map<string, number>();
    const lastDates = new Map<string, Date>();
    for (const g of groups) {
        const amountCents = Math.round(Number(g._sum.amount ?? 0) * 100);
        const adds = g.type === "income" || (g.type === "transfer" && g.transferDirection === "in");
        cents.set(g.accountId, (cents.get(g.accountId) ?? 0) + (adds ? amountCents : -amountCents));
        const last = g._max.transactionDate;
        const prev = lastDates.get(g.accountId);
        if (last && (!prev || last > prev)) lastDates.set(g.accountId, last);
    }

    const linkedIds = new Set(linked.map((l) => l.accountId));
    for (const [accountId, c] of cents) {
        stats.set(accountId, {
            balance: Math.round(c) / 100,
            lastTransactionDate: lastDates.get(accountId)!,
            hasLinkedTransfers: linkedIds.has(accountId),
        });
    }
    return stats;
}
