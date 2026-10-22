# reimbursements

Owns income → expense links: an income row pays back part of an expense row. Rows live in `reimbursement_allocations` (see `apps/api/ARCHITECTURE.md`).

- CRUD only: `POST /reimbursements`, `PATCH /reimbursements/:id`, `DELETE /reimbursements/:id`. Totals and netting are read elsewhere (`transactions/reimbursement-netting.ts`); this module never changes `Transaction.amount`.
- Caps (`reimburse ≤ expense amount`, `allocate ≤ income amount`) count ALL allocations on a side, active or not. Netting counts only active ones (both sides live and not hidden). Don't filter caps by active.
- Every create and update runs inside `$transaction` under `pg_advisory_xact_lock(hashtext('reimbursement:' || userId))`, so concurrent links for one user can't both pass a cap. Delete doesn't take the lock: it can only lower totals.
- Amounts are compared in integer cents via `toCents` from `transactions/reimbursement-netting.ts`.
- Link rules: both sides owned and not soft-deleted, one `income` and one `expense` (transfers rejected), same `currencyId`, neither side hidden, one row per (income, expense) pair.
- A future `GET /reimbursements/candidates` goes above the `:id` routes in the controller.
