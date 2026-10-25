export interface IUpdateTransaction {
    accountId?: string;
    type?: "income" | "expense" | "transfer";
    hidden?: boolean;
    transferDirection?: "in" | "out" | null;
    amount?: number;
    currencyId?: string;
    description?: string;
    transactionDate?: string;
    additionalDescription?: string | null;
    notes?: string | null;
    originalCategory?: string | null;
    externalId?: string | null;
    postedDate?: string | null;
    budgetId?: string | null;
    categoryId?: string | null;
    /** Cash or savings account for the linked mirror row. `null` clears the counterpart; omitted keeps it. */
    counterpartAccountId?: string | null;
    /** Amount in the counterpart account's currency. Omitted keeps the current value. */
    counterpartAmount?: number;
}
