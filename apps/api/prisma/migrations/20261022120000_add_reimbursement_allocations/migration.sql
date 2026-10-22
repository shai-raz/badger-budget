-- Link an income transaction to the expense it pays back (a reimbursement).
--
-- Model: one row per (income, expense) pair holds the amount that income reimburses on that
-- expense. Transaction.amount is never changed; every total subtracts the ACTIVE allocations at
-- read time (both sides not deleted and not hidden). The UNIQUE pair means one link per pair:
-- editing the amount updates the row instead of adding a second one.
--
-- Hard-deleted, no deleted_at: a link has no history value and dies with either transaction
-- (both foreign keys cascade), as does the owning user. amount is always positive.
--
-- No backfill: no existing row is a link, so an empty table is the truthful value.

-- CreateTable
CREATE TABLE "reimbursement_allocations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "income_id" UUID NOT NULL,
    "expense_id" UUID NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "reimbursement_allocations_amount_check" CHECK ("amount" > 0),
    CONSTRAINT "reimbursement_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reimbursement_allocations_expense_id_idx" ON "reimbursement_allocations"("expense_id");

-- CreateIndex
CREATE INDEX "reimbursement_allocations_user_id_idx" ON "reimbursement_allocations"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "reimbursement_allocations_income_id_expense_id_key" ON "reimbursement_allocations"("income_id", "expense_id");

-- AddForeignKey
ALTER TABLE "reimbursement_allocations" ADD CONSTRAINT "reimbursement_allocations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reimbursement_allocations" ADD CONSTRAINT "reimbursement_allocations_income_id_fkey" FOREIGN KEY ("income_id") REFERENCES "transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reimbursement_allocations" ADD CONSTRAINT "reimbursement_allocations_expense_id_fkey" FOREIGN KEY ("expense_id") REFERENCES "transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
