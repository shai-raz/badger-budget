# accounts

Accounts that transactions and budgets attach to. CRUD, soft-deleted, scoped by `userId`. Every user gets a default "Cash" account at sign-up (`auth/AGENTS.md`).

- Controller-facing methods return `toAccountResponse` (`account-response.mapper.ts`), never a raw Prisma row: `Decimal` columns would serialise as strings.
- **Balances** (`balance`, `balanceKind`, `balanceDate`, `cardFrame`, `cardIssuer`) are the latest observation, written unconditionally by `AccountBalanceService` during bank sync; `account_balance_snapshots` keeps the history. Never sum balances without checking `balanceKind` (see `bank-sync/AGENTS.md`), and never sum `cardFrame`.
- `upgradeUnknownAccountTypes` keeps `type: "unknown"` in its `where`: that makes the sweep atomic and idempotent. Don't lift it out.
- `default-account-currency.ts` is shared with the importer; don't duplicate it.

## Ledger accounts (cash, savings)

- `isLedgerAccountType` (`@badger/shared-data`) gates them. They always have a currency, and their transactions must use it (`TransactionsService.assertAccountCurrency`).
- Their balance is computed, not stored (`ledger-balance.ts`), and overlaid by `withLedgerStats` in `findAll` / `findOne` / `create` / `update` only. Nested `account` objects in transaction responses carry no computed balance.
- `cash_on_hand` (cash) is never summed with bank balances; savings reports `account_balance`, so it does.
- An account with transactions can't change currency, or become a ledger type while any transaction is in another currency. One with linked transfers can't be deleted or change type at all.
- `POST /accounts/:id/balance`: the server is authoritative for the difference. Inside one `$transaction` it locks the account row, recomputes the balance and records the adjustment as an uncategorized row. The client sends `date` because `transactionDate` is `@db.Date` and only the client knows the user's local day.
- Only cash is auto-created or suggested (default account, cash-withdrawal hint); savings never is.
