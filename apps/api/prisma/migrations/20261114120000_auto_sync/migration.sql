-- CreateTable
CREATE TABLE "auto_sync_grants" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "device_label" VARCHAR(100) NOT NULL,
    "interval_unit" VARCHAR(8) NOT NULL,
    "interval_count" INTEGER NOT NULL,
    "window_start_minute" INTEGER,
    "window_end_minute" INTEGER,
    "run_at_minute" INTEGER,
    "time_zone" VARCHAR(64) NOT NULL,
    "duration_days" INTEGER NOT NULL,
    "expires_at" TIMESTAMP(6) NOT NULL,
    "key_check_ct" TEXT NOT NULL,
    "key_check_iv" VARCHAR(32) NOT NULL,
    "key_check_auth_tag" VARCHAR(32) NOT NULL,
    "scheduled_run_at" TIMESTAMP(6) NOT NULL,
    "due_at" TIMESTAMP(6) NOT NULL,
    "run_token_hash" VARCHAR(64),
    "run_token_expires_at" TIMESTAMP(6),
    "last_run_at" TIMESTAMP(6),
    "missed_runs" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "auto_sync_grants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auto_sync_credentials" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "grant_id" UUID NOT NULL,
    "connection_id" UUID NOT NULL,
    "ciphertext" TEXT NOT NULL,
    "iv" VARCHAR(32) NOT NULL,
    "auth_tag" VARCHAR(32) NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auto_sync_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "auto_sync_grants_user_id_key" ON "auto_sync_grants"("user_id");

-- CreateIndex
CREATE INDEX "auto_sync_grants_due_at_idx" ON "auto_sync_grants"("due_at");

-- CreateIndex
CREATE INDEX "auto_sync_grants_expires_at_idx" ON "auto_sync_grants"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "auto_sync_credentials_grant_id_connection_id_key" ON "auto_sync_credentials"("grant_id", "connection_id");

-- CreateIndex
CREATE INDEX "auto_sync_credentials_connection_id_idx" ON "auto_sync_credentials"("connection_id");

-- AddForeignKey
ALTER TABLE "auto_sync_grants" ADD CONSTRAINT "auto_sync_grants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auto_sync_credentials" ADD CONSTRAINT "auto_sync_credentials_grant_id_fkey" FOREIGN KEY ("grant_id") REFERENCES "auto_sync_grants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auto_sync_credentials" ADD CONSTRAINT "auto_sync_credentials_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "scraper_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
