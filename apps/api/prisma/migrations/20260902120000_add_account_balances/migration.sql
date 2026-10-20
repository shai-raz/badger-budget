-- Persist account balances captured during bank sync.
--
-- `israeli-bank-scrapers` returns a balance per scraped account, but it does not mean the same
-- thing for every provider: banks report money in the account, Cal reports the next debit total,
-- and Max reports consumed credit. The `kind` column carries that distinction so callers never
-- sum incompatible numbers.

-- Append-only history. Intentionally no `deleted_at`: these are point-in-time observations, and
-- an unrecorded balance cannot be reconstructed later (we only scrape a transaction lookback window).
CREATE TABLE "account_balance_snapshots" (
    "id"             UUID         NOT NULL DEFAULT gen_random_uuid(),
    "user_id"        UUID         NOT NULL,
    "account_id"     UUID         NOT NULL,
    "scraper_job_id" UUID,
    "amount"         DECIMAL(12,2) NOT NULL,
    "currency_id"    UUID         NOT NULL,
    "kind"           VARCHAR(20)  NOT NULL,
    "balance_date"   DATE,
    "scraped_at"     TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at"     TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "account_balance_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "account_balance_snapshots_account_id_scraped_at_idx" ON "account_balance_snapshots" ("account_id", "scraped_at");
CREATE INDEX "account_balance_snapshots_user_id_scraped_at_idx" ON "account_balance_snapshots" ("user_id", "scraped_at");

ALTER TABLE "account_balance_snapshots"
    ADD CONSTRAINT "account_balance_snapshots_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "account_balance_snapshots"
    ADD CONSTRAINT "account_balance_snapshots_account_id_fkey"
    FOREIGN KEY ("account_id") REFERENCES "accounts" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "account_balance_snapshots"
    ADD CONSTRAINT "account_balance_snapshots_currency_id_fkey"
    FOREIGN KEY ("currency_id") REFERENCES "currencies" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "account_balance_snapshots"
    ADD CONSTRAINT "account_balance_snapshots_scraper_job_id_fkey"
    FOREIGN KEY ("scraper_job_id") REFERENCES "scraper_jobs" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Denormalized "latest balance" on accounts, so reads don't need to hit the history table.
-- balance_kind is stored per-account because accounts have no link back to the scraper provider.
ALTER TABLE "accounts" ADD COLUMN "balance"            DECIMAL(12,2);
ALTER TABLE "accounts" ADD COLUMN "balance_kind"       VARCHAR(20);
ALTER TABLE "accounts" ADD COLUMN "balance_date"       DATE;
ALTER TABLE "accounts" ADD COLUMN "balance_updated_at" TIMESTAMP(6);
