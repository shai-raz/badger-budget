# card-payoff-patterns

Exact-description patterns (e.g. "CREDIT CARD PAYMENT") used to detect credit-card-payoff transactions and re-tag them as hidden transfers, so they don't get double-counted as both an expense (from the checking account) and separately as card spend.

- System (seeded, shared) + user patterns, same split as `categories` — system patterns can't be deleted.
- This table has no soft delete — `remove()` is a hard `delete`.
- `applyPatternDescription()` is the actual retagging logic: expense→transfer(out,hidden), income→transfer(in,hidden), and already-transfer-but-visible rows just get re-hidden (linked transfer pairs are skipped so a pair is never hidden on one leg only). Direction always follows which bucket the transaction came from, never flips it.
- Card payoff wins over reimbursement links: retagging deletes the `reimbursement_allocations` on every expense/income row it converts, in the same DB transaction under the reimbursement lock. The removed count comes back as `linksRemoved` (`applyPatternDescription`, `POST /card-payoff-patterns/apply-all`, `transactions.mark-card-payoff`).
- `GET /card-payoff-patterns/link-preview?description=` and `GET /card-payoff-patterns/apply-all/link-preview` return `{ linkedTransactions, links }` so the confirm dialogs can warn first. Both routes are declared above `:id`; keep that order or `link-preview` is parsed as a pattern id.
- `applyAllPatternsToTransactions` (used by `POST /card-payoff-patterns/apply-all`) reruns every pattern against all of the user's transactions — safe to call repeatedly (idempotent updates).
- `transactions.mark-card-payoff` creates a new pattern from a transaction's description and immediately applies it — that's the usual entry point rather than creating patterns directly.
