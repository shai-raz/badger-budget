import type { Prisma } from "@prisma/client";

/** The source transaction a candidate search is run for. */
export interface SuggestionSourceTxn {
    id: string;
    type: "income" | "expense";
    amount: Prisma.Decimal | number;
    transactionDate: Date;
    currencyId: string;
}

/**
 * A pluggable rule that marks some candidates as "suggested" for a source transaction. Candidates matching no
 * source land in the "other" group. Sources are combined with OR.
 */
export interface ReimbursementSuggestionSource {
    readonly id: string;
    /** Prisma filter selecting candidates this source suggests for `source`. */
    suggestedWhere(source: SuggestionSourceTxn): Prisma.TransactionWhereInput;
}

export const REIMBURSEMENT_SUGGESTION_SOURCES = Symbol("REIMBURSEMENT_SUGGESTION_SOURCES");

/**
 * An income suggests expenses at least as large as itself; an expense suggests incomes no larger than itself.
 * Equal amounts count as suggested.
 */
export class AmountRuleSource implements ReimbursementSuggestionSource {
    readonly id = "amount-rule";

    suggestedWhere(source: SuggestionSourceTxn): Prisma.TransactionWhereInput {
        return source.type === "income" ? { amount: { gte: source.amount } } : { amount: { lte: source.amount } };
    }
}
