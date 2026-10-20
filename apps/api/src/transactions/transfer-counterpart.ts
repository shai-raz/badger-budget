import { BadRequestException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";

export interface CounterpartSourceState {
    id: string;
    userId: string;
    accountId: string;
    type: string;
    transferDirection: string | null;
    amount: Prisma.Decimal | number;
    currencyId: string;
    originalAmount: Prisma.Decimal | number | null;
    originalCurrencyId: string | null;
    description: string;
    transactionDate: Date;
    hidden: boolean;
}

export interface ExistingMirror {
    id: string;
    accountId: string;
    amount: Prisma.Decimal | number;
}

export interface CounterpartRequest {
    counterpartAccountId?: string | null;
    counterpartAmount?: number;
}

export interface MirrorSourceInfo {
    description: string;
    account: { name: string };
}

/** A linked mirror is read-only except notes; edits belong on the source transaction. */
export function assertMirrorEditAllowed(dto: object, source: MirrorSourceInfo | null): void {
    const touched = Object.entries(dto).some(([key, value]) => key !== "notes" && value !== undefined);
    if (!touched) return;
    throw new BadRequestException(mirrorMessage(source, "Edit"));
}

export function assertMirrorDeleteAllowed(source: MirrorSourceInfo | null): void {
    throw new BadRequestException(mirrorMessage(source, "Delete"));
}

function mirrorMessage(source: MirrorSourceInfo | null, verb: string): string {
    const name = source ? `“${source.description}” on ${source.account.name}` : "its source transaction";
    return `This entry is linked to ${name}. ${verb} that transaction instead.`;
}

/** Wallet currency == source currency -> source amount; == original currency -> original amount; else null. */
export function defaultCounterpartAmount(
    source: Pick<CounterpartSourceState, "amount" | "currencyId" | "originalAmount" | "originalCurrencyId">,
    walletCurrencyId: string,
): number | null {
    if (walletCurrencyId === source.currencyId) return Number(source.amount);
    if (source.originalCurrencyId && walletCurrencyId === source.originalCurrencyId && source.originalAmount != null) {
        return Number(source.originalAmount);
    }
    return null;
}

/**
 * Brings the linked mirror row of a transfer in line with the source's resulting state:
 * creates, moves, updates or removes it. Must run inside the same transaction as the source write.
 */
export async function reconcileCounterpart(
    tx: Prisma.TransactionClient,
    source: CounterpartSourceState,
    existing: ExistingMirror | null,
    request: CounterpartRequest,
): Promise<void> {
    const requestedId = request.counterpartAccountId;
    if (typeof requestedId === "string" && source.type !== "transfer") {
        throw new BadRequestException("Only transfers can have a counterpart account");
    }

    const target = requestedId === undefined ? (existing?.accountId ?? null) : requestedId;

    if (source.type !== "transfer" || target === null) {
        if (request.counterpartAmount !== undefined) {
            throw new BadRequestException("counterpartAmount requires a transfer with a counterpart account");
        }
        if (existing) {
            // Hard delete on purpose: the mirror is a derived row and this frees the unique slot.
            await tx.transaction.delete({ where: { id: existing.id } });
        }
        return;
    }

    const changed = target !== existing?.accountId;
    const mustValidate = changed || requestedId !== undefined;
    const wallet = await tx.account.findFirst({
        where: { id: target, userId: source.userId, deletedAt: null },
        select: { id: true, type: true, currencyId: true },
    });
    if (!wallet) {
        throw new BadRequestException("Counterpart account not found");
    }
    if (mustValidate) {
        if (wallet.type !== "cash") {
            throw new BadRequestException("The counterpart must be one of your cash accounts");
        }
    }
    // Always checked: a source-only accountId change can land on the existing counterpart's account.
    if (wallet.id === source.accountId) {
        throw new BadRequestException("The counterpart must be a different account");
    }
    if (!wallet.currencyId) {
        throw new BadRequestException("Set a currency on this cash account first");
    }

    let amount: number;
    if (request.counterpartAmount !== undefined) {
        amount = request.counterpartAmount;
    } else if (existing && !changed) {
        amount = Number(existing.amount);
    } else {
        const fallback = defaultCounterpartAmount(source, wallet.currencyId);
        if (fallback === null) {
            const currency = await tx.currency.findUnique({
                where: { id: wallet.currencyId },
                select: { code: true },
            });
            throw new BadRequestException(`Enter the amount received in ${currency?.code ?? "the wallet's currency"}`);
        }
        amount = fallback;
    }

    const mirror = {
        accountId: wallet.id,
        type: "transfer",
        transferDirection: source.transferDirection === "in" ? "out" : "in",
        amount,
        currencyId: wallet.currencyId,
        description: source.description,
        transactionDate: source.transactionDate,
        hidden: source.hidden,
        categoryId: null,
        externalId: null,
    };

    if (existing) {
        await tx.transaction.update({ where: { id: existing.id }, data: mirror });
    } else {
        await tx.transaction.create({ data: { ...mirror, userId: source.userId, counterpartOfId: source.id } });
    }
}
