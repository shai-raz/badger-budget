-- Add account_number column to accounts table
-- account_number stores the bank-assigned identifier (e.g. last 4 digits or full number from scraper).
-- name remains the user-facing display label (defaults to the account number on auto-creation).

ALTER TABLE "accounts" ADD COLUMN "account_number" VARCHAR(255);

-- Backfill: existing accounts were created with name = accountNumber, so copy name → account_number.
-- This preserves dedup correctness on the next bank sync / Google Sheets import.
UPDATE "accounts" SET "account_number" = "name" WHERE "account_number" IS NULL;

-- Index to speed up the per-user account-number lookup in transaction-import.service.ts
CREATE INDEX "accounts_user_id_account_number_idx" ON "accounts" ("user_id", "account_number");
