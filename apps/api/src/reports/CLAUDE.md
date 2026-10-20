# reports

Read-only analytics on top of transactions — currently just `GET /reports/spending` (total + per-category breakdown + comparison against the previous equal-length period, with an average toggle).

- All amounts are converted to a single requested display currency. Unlike `budgets`, an unresolvable FX rate here **throws** (`BadRequestException`) rather than silently treating the amount as 0 — the headline total must not quietly under-report. See `transactions/fx-conversion.service.ts` and `budgets/CLAUDE.md` for the contrast.
- Missing `FxRateDaily` cache entries get backfilled via concurrent provider fetches (`mapWithConcurrency`, capped at `FX_FETCH_CONCURRENCY = 5`, reusing the same concurrency helper as `bank-sync`).
- Period math (previous-period comparison window) lives in `utils/report-period.util.ts` — reuse it rather than hand-rolling date arithmetic.

- When adding filters to the reports/transactions UI or API, consider exposing them in the corresponding MCP tool (apps/api/src/mcp/tools) too.
