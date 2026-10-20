-- CreateIndex
CREATE INDEX "transactions_user_id_hidden_transaction_date_idx" ON "transactions"("user_id", "hidden", "transaction_date");
