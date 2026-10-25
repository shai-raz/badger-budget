import type { BankCompanyId } from "./providers";

/**
 * How to interpret the `balance` that `israeli-bank-scrapers` returns for a provider's accounts.
 *
 * The library exposes one `TransactionsAccount.balance` field, but it does not mean the same thing
 * everywhere — the card providers in particular report two different quantities. Treating them all
 * as a bare "balance" would silently mix incompatible numbers.
 */
export type BalanceKind =
    /**
     * Money actually in the account. Banks report it; a savings account's is computed from its own transactions
     * (see `apps/api/src/accounts/AGENTS.md`). The only kind meaningful to sum.
     */
    | "account_balance"
    /** What leaves the bank account on the next debit date. Cal only (`-nextTotalDebit`). */
    | "next_charge"
    /**
     * Credit line consumed — every unsettled charge, spanning later cycles too. The majority kind
     * among the card providers: max (`-(CreditLimit - OpenToBuy)`), isracard
     * (`remainingCredit - cardFrame`) and amex (`-(ניצלת עד כה)`), the latter two since IBS 6.10.0.
     */
    | "utilized_credit"
    /**
     * A cash account's computed balance: income + transfers in - expenses - transfers out over its own
     * non-deleted transactions (hidden included). Computed on read, never scraped, and never summed
     * with bank balances.
     */
    | "cash_on_hand";

/**
 * `null` means we can't interpret this provider's balance, so callers must skip it rather than
 * guess. Typed as a total record over `BankCompanyId`, so adding a provider fails to compile until
 * its balance semantics are declared here.
 *
 * No provider maps to `null` today. The `null` arm stays because `getBalanceKind` takes a bare
 * `string` (typically a `companyId` read back from the DB, which the type system can't vouch for)
 * and because a future provider may report something we can't interpret. Note that union and yahav
 * never return a balance in practice — their entry describes what it *would* mean if they start.
 */
export const BALANCE_KIND_BY_COMPANY: Record<BankCompanyId, BalanceKind | null> = {
    hapoalim: "account_balance",
    leumi: "account_balance",
    discount: "account_balance",
    mercantile: "account_balance",
    mizrahi: "account_balance",
    otsar: "account_balance",
    union: "account_balance",
    beinleumi: "account_balance",
    massad: "account_balance",
    yahav: "account_balance",
    beyhadBishvilha: "account_balance",
    visaCal: "next_charge",
    max: "utilized_credit",
    isracard: "utilized_credit",
    amex: "utilized_credit",
};

export function getBalanceKind(companyId: string): BalanceKind | null {
    return BALANCE_KIND_BY_COMPANY[companyId as BankCompanyId] ?? null;
}
