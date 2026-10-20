import type { IAccountResponse } from "./IAccountResponse";
import type { ICurrencyResponse } from "./ICurrencyResponse";
import type { ICategoryResponse } from "./ICategoryResponse";
import type { IBudgetResponse } from "./IBudgetResponse";
import type { ITransactionAttachmentResponse } from "./ITransactionAttachmentResponse";
import type { ITransactionCounterpart, ITransactionCounterpartSource } from "./ITransactionCounterpart";

export interface ITransactionResponse {
    id: string;
    userId: string;
    accountId: string;
    type: "income" | "expense" | "transfer";
    /**
     * Hidden transactions are excluded from the visible list and from
     * Transferred/Available totals (e.g. pattern-detected card payoffs).
     */
    hidden: boolean;
    /**
     * Money direction for transfers ("out" leaves the account, "in"
     * enters it); null for income/expense.
     */
    transferDirection: "in" | "out" | null;
    amount: number;
    currencyId: string;
    originalAmount: number | null;
    originalCurrencyId: string | null;
    description: string;
    transactionDate: Date;
    additionalDescription: string | null;
    /**
     * User's free-form notes. Accepted on create/update (max TRANSACTION_NOTES_MAX_LENGTH chars, from @badger/shared-data).
     */
    notes: string | null;
    originalCategory: string | null;
    externalId: string | null;
    paymentType: string | null;
    postedDate: Date | null;
    budgetId: string | null;
    categoryId: string | null;
    createdAt: Date;
    updatedAt: Date;
    deletedAt: Date | null;
    account: IAccountResponse;
    currency: ICurrencyResponse;
    originalCurrency: ICurrencyResponse | null;
    category: ICategoryResponse | null;
    budget: IBudgetResponse | null;
    attachments: ITransactionAttachmentResponse[];
    /**
     * Set only on the app-created mirror row of a linked transfer: the id of
     * the source transaction it mirrors. Null on every other row.
     */
    counterpartOfId: string | null;
    /** On a source transfer: the linked mirror row in the cash account, if any. */
    counterpart: ITransactionCounterpart | null;
    /** On a mirror row: the source transfer it mirrors. Null on every other row. */
    counterpartOf: ITransactionCounterpartSource | null;
    /**
     * Budgets this transaction counts toward, derived from the
     * transaction's category via budget-category links (plus the
     * directly linked budget, if any). Only populated on the
     * single-transaction detail endpoint.
     */
    applicableBudgets?: IBudgetResponse[];
}
