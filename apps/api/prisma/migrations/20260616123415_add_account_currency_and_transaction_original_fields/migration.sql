-- AlterTable
ALTER TABLE "accounts" ADD COLUMN     "currency_id" UUID;

-- AlterTable
ALTER TABLE "transactions" ADD COLUMN     "original_amount" DECIMAL(12,2),
ADD COLUMN     "original_currency_id" UUID;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "currency_backfilled_at" TIMESTAMP(6);

-- CreateIndex
CREATE INDEX "accounts_currency_id_idx" ON "accounts"("currency_id");

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_currency_id_fkey" FOREIGN KEY ("currency_id") REFERENCES "currencies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_original_currency_id_fkey" FOREIGN KEY ("original_currency_id") REFERENCES "currencies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
