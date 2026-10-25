import type { Account, Currency, Prisma } from "@prisma/client";
import { AccountResponseDto } from "../transactions/dto/account-response.dto";
import { parseAccountType } from "@badger/shared-data";
import type { BalanceKind } from "@badger/shared-data";

/**
 * Convert a Prisma `Decimal` to a JS number, passing through null/undefined as null.
 * Never rely on `JSON.stringify`/default serialization for a `Decimal` field —
 * `Decimal.toJSON()` yields a string, not a number.
 */
function decimalToNumberOrNull(value: Prisma.Decimal | null | undefined): number | null {
    if (value === null || value === undefined) {
        return null;
    }
    return value.toNumber();
}

/** Maps a raw Prisma `Account` row (with its `currency` relation loaded) to the API response shape. */
export function toAccountResponse(row: Account & { currency: Currency | null }): AccountResponseDto {
    return {
        ...row,
        type: parseAccountType(row.type),
        balanceKind: row.balanceKind as BalanceKind | null,
        balance: decimalToNumberOrNull(row.balance),
        cardFrame: decimalToNumberOrNull(row.cardFrame),
        // Ledger-only computed fields; AccountsService overlays real values (see ledger-balance.ts).
        hasLinkedTransfers: false,
        hasTransactions: false,
        lastTransactionDate: null,
    };
}
