-- CreateTable
CREATE TABLE "budget_categories" (
    "budget_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "budget_categories_pkey" PRIMARY KEY ("budget_id", "category_id")
);

-- CreateTable
CREATE TABLE "transaction_conversions" (
    "transaction_id" UUID NOT NULL,
    "target_currency_id" UUID NOT NULL,
    "converted_amount" DECIMAL(20,8) NOT NULL,
    "conversion_rate" DECIMAL(20,10) NOT NULL,
    "rate_date" DATE NOT NULL,
    "provider" VARCHAR(100),
    "provider_metadata" JSONB,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "transaction_conversions_pkey" PRIMARY KEY ("transaction_id", "target_currency_id")
);

-- CreateTable
CREATE TABLE "fx_rates_daily" (
    "base_currency_id" UUID NOT NULL,
    "quote_currency_id" UUID NOT NULL,
    "rate_date" DATE NOT NULL,
    "rate" DECIMAL(20,10) NOT NULL,
    "provider" VARCHAR(100),
    "provider_metadata" JSONB,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "fx_rates_daily_pkey" PRIMARY KEY ("base_currency_id", "quote_currency_id", "rate_date")
);

-- CreateIndex
CREATE INDEX "budget_categories_category_id_idx" ON "budget_categories"("category_id");

-- CreateIndex
CREATE INDEX "transaction_conversions_target_currency_id_idx" ON "transaction_conversions"("target_currency_id");

-- CreateIndex
CREATE INDEX "transaction_conversions_rate_date_idx" ON "transaction_conversions"("rate_date");

-- CreateIndex
CREATE INDEX "fx_rates_daily_quote_currency_id_idx" ON "fx_rates_daily"("quote_currency_id");

-- Backfill existing single-category budgets into the new join table.
-- This migration is additive and keeps budgets.category_id in place for compatibility.
INSERT INTO "budget_categories" ("budget_id", "category_id", "created_at", "updated_at")
SELECT "id", "category_id", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "budgets"
WHERE "category_id" IS NOT NULL
ON CONFLICT ("budget_id", "category_id") DO NOTHING;

-- AddForeignKey
ALTER TABLE "budget_categories" ADD CONSTRAINT "budget_categories_budget_id_fkey" FOREIGN KEY ("budget_id") REFERENCES "budgets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_categories" ADD CONSTRAINT "budget_categories_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_conversions" ADD CONSTRAINT "transaction_conversions_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_conversions" ADD CONSTRAINT "transaction_conversions_target_currency_id_fkey" FOREIGN KEY ("target_currency_id") REFERENCES "currencies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fx_rates_daily" ADD CONSTRAINT "fx_rates_daily_base_currency_id_fkey" FOREIGN KEY ("base_currency_id") REFERENCES "currencies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fx_rates_daily" ADD CONSTRAINT "fx_rates_daily_quote_currency_id_fkey" FOREIGN KEY ("quote_currency_id") REFERENCES "currencies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
