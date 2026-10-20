-- Link a transfer to an app-created "mirror" row in one of the user's cash accounts.
--
-- Model: when a transfer (e.g. an ATM withdrawal) names a cash account as its counterpart, the
-- server creates ONE extra transaction in that account - the mirror - and points it back at the
-- source row via `counterpart_of_id`. The column is set ONLY on the mirror; the source row keeps
-- NULL and reaches its mirror through the reverse relation. The UNIQUE index guarantees a source
-- has at most one mirror. Deleting the source cascades to its mirror.
--
-- No backfill: no existing row is a mirror, so NULL is the truthful value.

ALTER TABLE "transactions" ADD COLUMN "counterpart_of_id" UUID;

CREATE UNIQUE INDEX "transactions_counterpart_of_id_key" ON "transactions"("counterpart_of_id");

ALTER TABLE "transactions" ADD CONSTRAINT "transactions_counterpart_of_id_fkey" FOREIGN KEY ("counterpart_of_id") REFERENCES "transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
