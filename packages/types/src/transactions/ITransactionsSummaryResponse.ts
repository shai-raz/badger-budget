/**
 * Aggregate totals for the transaction list, matching the active filters
 * (search, categoryIds, type, date range) — the same filters as
 * `GET /transactions`, minus pagination/sort/hidden.
 *
 * Hidden transactions are ALWAYS excluded from these totals, regardless of the
 * list's "show hidden" toggle.
 *
 * All amounts are naive sums over the transaction-currency `amount` with NO FX
 * conversion — mixed-currency selections are summed as-is (matching the web
 * client's existing `Total.vue` behavior). Cross-currency conversion belongs to
 * the reports module.
 */
export interface ITransactionsSummaryResponse {
    /** Σ of `amount` over income transactions. */
    income: number;
    /** Σ of `amount` over expense transactions. */
    expenses: number;
    /** `income − expenses`. */
    net: number;
    /**
     * Σ over transfer transactions of `(transferDirection === "in" ? -1 : +1) ×
     * amount` — a null/absent direction counts as "out" (+1).
     */
    transferred: number;
    /** `net − transferred`. */
    available: number;
    /** Number of (non-hidden) transactions matching the filters. */
    count: number;
    /**
     * Currency code of the most recent matching transaction (best-effort
     * display hint only — totals are not converted to it). Falls back to "ILS"
     * when there are no matching transactions.
     */
    currencyCode: string;
}
