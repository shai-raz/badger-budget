# transactions

Core ledger entries. Also owns FX conversion (`fx-conversion.service.ts`) and the shared import path (`transaction-import.service.ts`) used by `bank-sync` and `google-sheets`.

- `type` (`income` / `expense` / `transfer`), `hidden` and `transferDirection` are independent. Wherever spend is aggregated (summary, budgets, reports, MCP tools), transfers and hidden rows are excluded and amounts are net of active reimbursements; keep those places consistent.
- `getRate()` throws on an unresolvable rate. Budgets treat a missing snapshot as 0, reports throw: deliberate, see `budgets/AGENTS.md`.
- Import: look in `transaction-import.service.ts` first when dedup, category resolution or currency handling looks wrong. Imports write Prisma directly, so DTO-only limits (`notes`, `additionalDescription`) don't apply to them; the web form PATCHes only changed fields for that reason.
- **Synced rows** (`externalId` set) can't change bank-owned fields or contradict the bank direction (`synced-edit-lock.ts`). Internal `updateMany` callers bypass the lock on purpose. The web form mirrors these rules in `utils/transactionForm.ts`.
- **Linked transfers**: a transfer to a ledger account (cash or savings) keeps exactly one mirror row there (`counterpartOfId`). `reconcileCounterpart` (`transfer-counterpart.ts`) is the only path that writes mirrors, inside the source's transaction. Mirrors are read-only except `notes`. Bulk writers must skip or move linked rows (card-payoff re-hide skips pairs, mapping-rule apply skips mirrors, the import date heal moves the mirror too). An existing mirror keeps its amount unless `counterpartAmount` is sent, so clients send it whenever the source amount or currency changes.
- `getSummary` backs linked transfer legs out of `transferred` when there's no account filter, so cross-currency pairs don't distort it.
- **Reimbursements**: `update()` and `remove()` take `lockReimbursements` inside their `$transaction`. A linked row can't drop below its allocated total or change currency or type (`reimbursement-edit-guard.ts`); hiding is always allowed. `remove()` hard-deletes its allocations, since a soft delete never fires the FK cascade.
- When adding filters here, consider the matching MCP tool (`mcp/AGENTS.md`).
