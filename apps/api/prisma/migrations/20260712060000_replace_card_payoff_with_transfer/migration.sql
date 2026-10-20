-- Transactions gain a visibility flag independent of type, and a direction for transfers.
ALTER TABLE "transactions" ADD COLUMN "hidden" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "transactions" ADD COLUMN "transfer_direction" VARCHAR(3);

-- Legacy card-payoff rows become hidden transfers. They are bank-side debits,
-- so direction is "out"; hidden transfers are excluded from Transferred/Available
-- math regardless.
UPDATE "transactions"
SET "type" = 'transfer', "hidden" = true, "transfer_direction" = 'out'
WHERE "type" = 'card-payoff';

