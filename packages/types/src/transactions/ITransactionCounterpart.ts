import type { AccountType } from "@badger/shared-data";

/** The mirror row of a linked transfer, as seen from the source transaction. */
export interface ITransactionCounterpart {
    id: string;
    accountId: string;
    accountName: string;
    accountType: AccountType;
    amount: number;
    currencyId: string;
}

/** The source row of a linked transfer, as seen from its mirror transaction. */
export interface ITransactionCounterpartSource {
    id: string;
    description: string;
    accountId: string;
    accountName: string;
}
