# Migration: add_account_number

Adds a separate `account_number` column to the `accounts` table, decoupling the bank-assigned identifier from the user-editable display name.

## Why

Previously `name` held the raw account number from the scraper (e.g. "1234"). This was used both as the user-facing label and as the dedup key when matching future imports to existing accounts. The new column separates these concerns:

- `account_number` — bank identifier, set once by the scraper/import, read-only to the user.
- `name` — friendly label, editable by the user; defaults to `account_number` on auto-creation.

## Pre-flight

```bash
# From apps/api
pnpm prisma:generate
pnpm check-types
pnpm test
```

## Migration steps

The migration is applied by Prisma automatically on `pnpm prisma:migrate`. It:

1. Adds the nullable `account_number VARCHAR(255)` column.
2. Backfills `account_number = name` for all existing rows (preserving import dedup).
3. Adds an index on `(user_id, account_number)` for fast lookup.

## Rollback

```sql
DROP INDEX IF EXISTS "accounts_user_id_account_number_idx";
ALTER TABLE "accounts" DROP COLUMN IF EXISTS "account_number";
```

## Parity check

After migration, verify all existing accounts have their number backfilled:

```sql
SELECT COUNT(*) FROM accounts WHERE account_number IS NULL;
-- Expected: 0
```
