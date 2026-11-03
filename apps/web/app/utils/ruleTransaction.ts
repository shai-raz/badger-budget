import type { ITransactionResponse } from "@badger/types";
import type { RuleTransaction } from "@badger/utils";

/** The transaction fields a rule is evaluated against, read from a transaction row. */
export function toRuleTransaction(tx: ITransactionResponse): RuleTransaction {
    return {
        description: tx.description,
        originalCategory: tx.originalCategory,
        amount: tx.amount,
        accountId: tx.accountId,
        type: tx.type,
    };
}
