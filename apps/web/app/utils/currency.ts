/**
 * Shared currency formatter. Falls back to ILS (the app-wide default
 * currency) when no code is provided.
 */
export function formatCurrency(amount: number, currencyCode?: string): string {
    return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: currencyCode || "ILS",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(amount);
}

/**
 * Whole-unit currency formatter (rounded, no decimals) for spots that show
 * large amounts at a glance — budget progress, the "Where it went" donut.
 * Everywhere else (transactions, the month summary, account balances) keeps
 * `formatCurrency`'s 2 decimals; don't swap those over to this.
 */
export function formatCurrencyRounded(amount: number, currencyCode?: string): string {
    return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: currencyCode || "ILS",
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(amount);
}
