import type { AccountType, BalanceKind } from "@badger/shared-data";
import type { ICurrencyResponse } from "./ICurrencyResponse";

export interface IAccountResponse {
    id: string;
    name: string;
    accountNumber: string | null;
    type: AccountType;
    icon: string | null;
    color: string | null;
    currencyId: string | null;
    currency: ICurrencyResponse | null;
    /** Latest scraped balance; cards stored negative, banks positive. */
    balance: number | null;
    /** What `balance` represents — account balance, next charge, or utilized credit. */
    balanceKind: BalanceKind | null;
    /** Next debit date (Cal only). */
    balanceDate: Date | null;
    /** When `balance`/`balanceKind` were last refreshed by a sync. */
    balanceUpdatedAt: Date | null;
    /** Card credit limit, latest observation. Never sum across accounts (shared group-level frame). */
    cardFrame: number | null;
    /** IBS `cardType` — bankIssued | companyIssued. Cal-only. */
    cardIssuer: string | null;
    /** Cash and savings (ledger accounts) only: true when any non-deleted row on the account is a transfer mirror or has a counterpart. */
    hasLinkedTransfers: boolean;
    /** Cash and savings (ledger accounts) only: true when the account has any non-deleted transaction (pins its currency). */
    hasTransactions: boolean;
    /** Cash and savings (ledger accounts) only: the latest `transactionDate` on the account. */
    lastTransactionDate: Date | null;
    createdAt: Date;
    updatedAt: Date;
}
