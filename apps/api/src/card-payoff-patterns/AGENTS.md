# card-payoff-patterns

Exact-description patterns (e.g. "CREDIT CARD PAYMENT") used to detect credit-card-payoff transactions and re-tag them as hidden transfers, so they don't get double-counted as both an expense (from the checking account) and separately as card spend.

- System (seeded, shared) + user patterns, same split as `categories` — system patterns can't be deleted.
- This table has no soft delete — `remove()` is a hard `delete`.
- `applyPatternDescription()` is the actual retagging logic: expense→transfer(out,hidden), income→transfer(in,hidden), and already-transfer-but-visible rows just get re-hidden (linked transfer pairs are skipped so a pair is never hidden on one leg only). Direction always follows which bucket the transaction came from, never flips it.
- Card payoff wins over reimbursement links: retagging deletes the `reimbursement_allocations` on every expense/income row it converts, in the same DB transaction under the reimbursement lock. The removed count comes back as `linksRemoved`.
- The `link-preview` routes are declared above `:id`; keep that order or `link-preview` is parsed as a pattern id.
- `applyAllPatternsToTransactions` is idempotent; `transactions.mark-card-payoff` (create a pattern from a description and apply it) is the usual entry point.
