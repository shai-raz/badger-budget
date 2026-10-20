-- AlterTable
ALTER TABLE "transactions" ADD COLUMN     "payment_type" VARCHAR(20);

-- CreateTable
CREATE TABLE "sheet_connections" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "spreadsheet_id" VARCHAR(255) NOT NULL,
    "sheet_name" VARCHAR(100) NOT NULL DEFAULT 'Sheet1',
    "last_synced_at" TIMESTAMP(6),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "sheet_connections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sheet_connections_user_id_idx" ON "sheet_connections"("user_id");

-- CreateIndex
CREATE INDEX "sheet_connections_is_active_idx" ON "sheet_connections"("is_active");

-- AddForeignKey
ALTER TABLE "sheet_connections" ADD CONSTRAINT "sheet_connections_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
