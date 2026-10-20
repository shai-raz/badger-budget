-- One-time data fix: cash accounts must always have a currency (their transactions are
-- constrained to it). Backfill existing currency-less cash accounts with the user's most
-- common account currency, falling back to ILS. The column stays nullable for other types.
UPDATE "accounts" a SET "currency_id" = COALESCE(
  (SELECT a2."currency_id" FROM "accounts" a2
     WHERE a2."user_id" = a."user_id" AND a2."currency_id" IS NOT NULL AND a2."deleted_at" IS NULL
     GROUP BY a2."currency_id" ORDER BY COUNT(*) DESC, a2."currency_id" LIMIT 1),
  (SELECT c."id" FROM "currencies" c WHERE c."code" = 'ILS'))
WHERE a."type" = 'cash' AND a."currency_id" IS NULL;
