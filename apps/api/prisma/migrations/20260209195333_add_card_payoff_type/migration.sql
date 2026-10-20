-- AlterTable
ALTER TABLE "transactions" ALTER COLUMN "type" SET DATA TYPE VARCHAR(50);

-- CreateTable
CREATE TABLE "card_payoff_patterns" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID,
    "description" VARCHAR(255) NOT NULL,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "card_payoff_patterns_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "card_payoff_patterns_user_id_idx" ON "card_payoff_patterns"("user_id");

-- CreateIndex
CREATE INDEX "card_payoff_patterns_description_idx" ON "card_payoff_patterns"("description");

-- CreateIndex
CREATE INDEX "card_payoff_patterns_is_system_idx" ON "card_payoff_patterns"("is_system");

-- AddForeignKey
ALTER TABLE "card_payoff_patterns" ADD CONSTRAINT "card_payoff_patterns_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
