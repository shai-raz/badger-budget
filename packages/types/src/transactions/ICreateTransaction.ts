export interface ICreateTransaction {
    accountId: string;
    type: "income" | "expense" | "transfer";
    hidden?: boolean;
    transferDirection?: "in" | "out";
    amount: number;
    currencyId: string;
    description: string;
    transactionDate: string;
    additionalDescription?: string;
    notes?: string;
    originalCategory?: string;
    externalId?: string;
    postedDate?: string;
    budgetId?: string;
    categoryId?: string;
    /** Cash or savings account receiving/sending the money; transfers only. */
    counterpartAccountId?: string;
    /** Amount in the counterpart account's currency. */
    counterpartAmount?: number;
}
