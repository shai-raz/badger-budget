-- CreateTable
CREATE TABLE "cash_withdrawal_patterns" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "match_field" VARCHAR(30) NOT NULL,
    "text" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "cash_withdrawal_patterns_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cash_withdrawal_patterns_user_id_idx" ON "cash_withdrawal_patterns"("user_id");

-- CreateIndex
CREATE INDEX "cash_withdrawal_patterns_is_system_idx" ON "cash_withdrawal_patterns"("is_system");

-- AddForeignKey
ALTER TABLE "cash_withdrawal_patterns" ADD CONSTRAINT "cash_withdrawal_patterns_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
