import { BadRequestException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import type { UpdateTransactionDto } from "./dto/update-transaction.dto";

export interface SyncedLockSnapshot {
    externalId: string | null;
    type: string;
    transferDirection: string | null;
    amount: Prisma.Decimal | number | string;
    currencyId: string;
    transactionDate: Date;
    postedDate: Date | null;
    accountId: string;
    description: string;
    originalCategory: string | null;
}

type LockedField =
    | "amount"
    | "currencyId"
    | "transactionDate"
    | "postedDate"
    | "accountId"
    | "description"
    | "externalId"
    | "originalCategory";

export const LOCKED_FIELDS: ReadonlyArray<[LockedField, string]> = [
    ["amount", "Amount"],
    ["currencyId", "Currency"],
    ["transactionDate", "Date"],
    ["postedDate", "Posted date"],
    ["accountId", "Account"],
    ["description", "Description"],
    ["externalId", "External reference"],
    ["originalCategory", "Original category"],
];

const day = (v: unknown): string => new Date(v as string | Date).toISOString().slice(0, 10);

function sameValue(field: LockedField, provided: unknown, stored: unknown): boolean {
    if (provided === null || stored === null || stored === undefined) {
        return (provided ?? null) === (stored ?? null);
    }
    if (field === "amount") {
        return Math.round(Number(provided) * 100) === Math.round(Number(stored) * 100);
    }
    if (field === "transactionDate" || field === "postedDate") {
        return day(provided) === day(stored);
    }
    return provided === stored;
}

/**
 * Rejects PATCH payloads that change bank-owned fields (or break the bank's money direction)
 * on a bank-synced transaction. Manual rows (no externalId) are unrestricted.
 */
export function assertSyncedEditAllowed(current: SyncedLockSnapshot, dto: UpdateTransactionDto): void {
    if (!current.externalId) return;

    for (const [field, label] of LOCKED_FIELDS) {
        const provided = (dto as unknown as Record<string, unknown>)[field];
        if (provided === undefined) continue;
        if (!sameValue(field, provided, current[field])) {
            throw new BadRequestException(`${label} can't be changed on a bank-synced transaction`);
        }
    }

    const bank =
        current.type === "income"
            ? "in"
            : current.type === "transfer"
              ? current.transferDirection === "in"
                  ? "in"
                  : "out"
              : "out";
    const resultType = dto.type ?? current.type;

    let resultDir: "in" | "out" | null = null;
    if (resultType === "expense") resultDir = "out";
    else if (resultType === "income") resultDir = "in";
    else if (resultType === "transfer") {
        if (dto.transferDirection !== undefined) resultDir = dto.transferDirection ?? "out";
        else if (dto.type === "transfer" && !current.transferDirection)
            resultDir = current.type === "income" ? "in" : "out";
        else resultDir = current.transferDirection === "in" ? "in" : "out";
    }

    if (resultDir !== null && resultDir !== bank) {
        throw new BadRequestException(
            bank === "out"
                ? "This bank-synced transaction is money out: it can only be an expense or an outgoing transfer"
                : "This bank-synced transaction is money in: it can only be income or an incoming transfer",
        );
    }
}
