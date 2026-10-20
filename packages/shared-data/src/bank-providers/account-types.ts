import type { BankCompanyId } from "./providers";

/**
 * What kind of account a provider's scraped accounts represent. Mirrors the `Account.type` values
 * the app persists ("bank" / "credit_card"), so it can be written straight onto the column.
 */
export type ScrapedAccountType = "bank" | "credit_card";

/**
 * The provider already tells us whether an account is a card or a bank account, so accounts
 * auto-created during sync don't have to stay typed `"unknown"` forever. A `null` entry means the
 * provider is deliberately unclassified — its accounts are neither truthfully `bank` nor
 * `credit_card` — and the sweep must skip it rather than guess.
 *
 * Deliberately a `Record<BankCompanyId, …>` rather than a field on `BANK_PROVIDERS`: the array is a
 * bare `as const` with no element annotation, so a field there would buy no compile-time totality,
 * whereas this record fails to compile until a newly added provider is classified — the same
 * guarantee `BALANCE_KIND_BY_COMPANY` relies on. `BANK_PROVIDERS` is also UI presentation data
 * (the web connection modal projects name/companyId/loginFields off it); persistence semantics
 * don't belong in it.
 */
export const ACCOUNT_TYPE_BY_COMPANY: Record<BankCompanyId, ScrapedAccountType | null> = {
    hapoalim: "bank",
    leumi: "bank",
    discount: "bank",
    mercantile: "bank",
    mizrahi: "bank",
    otsar: "bank",
    union: "bank",
    beinleumi: "bank",
    massad: "bank",
    yahav: "bank",
    // Histadrut's prepaid stored-value benefits card, not a deposit account — IBS scrapes it via a
    // card balance page (hist.org.il/card/balanceAndUses). Left unclassified rather than mistyped.
    beyhadBishvilha: null,
    visaCal: "credit_card",
    max: "credit_card",
    isracard: "credit_card",
    amex: "credit_card",
};

/**
 * `null` when `companyId` is unrecognized, or when it names a provider that's deliberately left
 * unclassified in `ACCOUNT_TYPE_BY_COMPANY`. Either way, callers must leave the account's type
 * alone rather than guess. Takes a bare `string` because the id is typically read back from the DB.
 */
export function getScrapedAccountType(companyId: string): ScrapedAccountType | null {
    return ACCOUNT_TYPE_BY_COMPANY[companyId as BankCompanyId] ?? null;
}
