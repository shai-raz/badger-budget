# budgets

Spending limits over a period (daily/weekly/monthly/yearly) tied to one or more categories.

- Period windows (daily/weekly/monthly/yearly boundaries) are computed in the _user's timezone_, not UTC — check this before touching period-boundary logic.
- Category overlap across budgets (the same category counted toward more than one budget) is intentional/expected behavior, not a bug — don't "fix" it.
- A budget has a legacy single `categoryId` plus a `categoryIds[]` / `budgetCategories` join table — `create()` resolves whichever the caller sent into the other. Check `resolveCategoryIds()` before assuming only one shape exists.
- Spend totals read pre-materialized `TransactionConversion` snapshot rows for cross-currency amounts and treat a missing snapshot as 0 — this is deliberately different from `reports`, which fails hard on unresolvable FX rather than under-reporting. See `transactions/fx-conversion.service.ts`.
- Spend is net of active income reimbursements (`reimbursedBy`, see `transactions/reimbursement-netting.ts`); hidden expenses still count gross (accepted gap, same as `reports`).
- Deleting a category detaches it from budgets (`categoryId` set to null) rather than cascading the budget delete — see `categories/AGENTS.md`.
