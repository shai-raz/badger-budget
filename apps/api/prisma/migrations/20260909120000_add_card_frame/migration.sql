-- Capture the card credit limit (`cardFrame`) and, where the provider says so, who issued the card.
--
-- `israeli-bank-scrapers` has exposed `TransactionsAccount.cardFrame` since 6.9.0 and
-- `TransactionsAccount.cardType` alongside it. Only the four card providers (visaCal, max,
-- isracard, amex) ever set a frame; bank accounts leave it absent, which stays NULL here.
--
-- `card_frame` must NEVER be summed across accounts. Cal reports a *group-level* frame — the
-- credit limit of the whole issuing agreement, repeated identically on every card under it — so
-- adding them up multiplies one limit by the number of cards. A frame of `0` means a cancelled
-- card rather than a zero limit, and is stored as NULL instead.
--
-- `card_issuer` holds IBS's `cardType` (`bankIssued` / `companyIssued`), which only Cal reports.
-- It's named `card_issuer` rather than `card_type` so it doesn't read as a sibling of
-- `accounts.type` (credit_card / bank / cash / unknown).
--
-- No backfill: we never observed a frame for existing rows, so NULL is the truthful value. The
-- columns fill in on the next scrape.

ALTER TABLE "accounts" ADD COLUMN "card_frame"  DECIMAL(12,2);
ALTER TABLE "accounts" ADD COLUMN "card_issuer" VARCHAR(20);

ALTER TABLE "account_balance_snapshots" ADD COLUMN "card_frame"  DECIMAL(12,2);
ALTER TABLE "account_balance_snapshots" ADD COLUMN "card_issuer" VARCHAR(20);
