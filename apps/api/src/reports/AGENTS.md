# reports

Read-only analytics on top of transactions — currently just `GET /reports/spending` (total + per-category breakdown + comparison against a second period).

- Hidden expenses are excluded (`hidden: false` in `findExpenses`), matching the transactions summary and budgets. Amounts are net of active income reimbursements.
- All amounts are converted to a single requested display currency. Unlike `budgets`, an unresolvable FX rate here **throws** (`BadRequestException`) rather than silently treating the amount as 0 — the headline total must not quietly under-report. See `transactions/fx-conversion.service.ts` and `budgets/AGENTS.md` for the contrast.
- Missing `FxRateDaily` cache entries get backfilled via concurrent provider fetches (`mapWithConcurrency`, capped at `FX_FETCH_CONCURRENCY = 5`, reusing the same concurrency helper as `bank-sync`).
- Period math lives in `utils/report-period.util.ts` — reuse it rather than hand-rolling date arithmetic. `compare=previous` (default) uses `getPreviousPeriod`: full months → the preceding calendar months; window starting on the 1st ending mid-month → same days in the preceding months (day clamped); otherwise the same number of days. `compare=yearOverYear` uses `getYearOverYearPeriod`.
- When adding filters here, consider the matching MCP tool (`mcp/AGENTS.md`).
