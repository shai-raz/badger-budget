# reimbursements

Owns income → expense links: an income row pays back part of an expense row. Rows live in `reimbursement_allocations` (see `apps/api/ARCHITECTURE.md`).

- Allocation CRUD: `POST /reimbursements`, `PATCH /reimbursements/:id`, `DELETE /reimbursements/:id`. Totals and netting are read elsewhere (`transactions/reimbursement-netting.ts`); this module never changes `Transaction.amount`.
- Caps (`reimburse ≤ expense amount`, `allocate ≤ income amount`) count ALL allocations on a side, active or not. Netting counts only active ones (both sides live and not hidden). Don't filter caps by active.
- Every create and update runs inside `$transaction` under the per-user lock `lockReimbursements` (`transactions/reimbursement-lock.ts`), so concurrent links for one user can't both pass a cap. Delete doesn't take the lock: it can only lower totals. Edits and deletes of linked transactions take the same lock (see `transactions/AGENTS.md`).
- Amounts are compared in integer cents via `toCents` from `transactions/reimbursement-netting.ts`.
- Link rules: both sides owned and not soft-deleted, one `income` and one `expense` (transfers rejected), same `currencyId`, neither side hidden, one row per (income, expense) pair.
- `GET /reimbursements/candidates?transactionId=&search=` (above the `:id` routes) feeds the picker. Candidates are the opposite type, same currency, visible, not already linked, with a balance left. They split into `suggested` (matched by any `ReimbursementSuggestionSource`, OR-ed) and `other` (`NOT` the suggested filter). Each group takes the 50 nearest by date from before and after the source date. The `remaining` figure counts all allocations.
- Suggestion sources are registered under `REIMBURSEMENT_SUGGESTION_SOURCES` in `reimbursements.module.ts` (today: `AmountRuleSource`, income suggests expenses ≥ its amount, expense suggests incomes ≤ its amount). Add a rule as a new class and register it there.
- `search` is text (description, additional description, category name), plus an exact amount match when it parses as one (`parseSearchAmount`, so `₪1,200` works).
