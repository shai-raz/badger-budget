import type { ITransactionResponse } from "@badger/types";

export const formatDate = (date: string | Date) => {
    return new Date(date).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
    });
};

type TransactionLike = Pick<ITransactionResponse, "type" | "transferDirection">;

// Money entering the account gets a "+": income, or a transfer coming in.
export const transactionSign = (transaction: TransactionLike) =>
    transaction.type === "income" || (transaction.type === "transfer" && transaction.transferDirection === "in")
        ? "+"
        : "-";

export const transactionAmountClass = (transaction: TransactionLike) =>
    transaction.type === "transfer"
        ? "text-surface-600 dark:text-surface-300"
        : transaction.type === "income"
          ? "text-income"
          : "text-expense";

export const transactionTypeSeverity = (transaction: TransactionLike): "success" | "info" | "danger" =>
    transaction.type === "income" ? "success" : transaction.type === "transfer" ? "info" : "danger";

const TRANSACTION_TYPE_LABEL: Record<ITransactionResponse["type"], string> = {
    expense: "Expense",
    income: "Income",
    transfer: "Transfer",
};

export const transactionTypeLabel = (type: ITransactionResponse["type"]) => TRANSACTION_TYPE_LABEL[type];
