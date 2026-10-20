-- Watermark for the demo-login top-up: the last calendar day through which demo transactions
-- have been generated for the demo user.
--
-- NULL for every non-demo user — this column has no meaning outside the demo account.
--
-- No backfill: an already-seeded demo user (from before this column existed) keeps a NULL
-- watermark. The app bootstraps it the first time it's needed, by reading the demo user's latest
-- salary transaction date instead of assuming it's caught up.

ALTER TABLE "users" ADD COLUMN "demo_data_through" DATE;
