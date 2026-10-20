-- CreateTable
CREATE TABLE "user_sync_secrets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "kdf_salt" VARCHAR(64) NOT NULL,
    "verifier_ct" TEXT NOT NULL,
    "verifier_iv" VARCHAR(32) NOT NULL,
    "verifier_auth_tag" VARCHAR(32) NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "user_sync_secrets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scraper_connections" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "company_id" VARCHAR(50) NOT NULL,
    "display_name" VARCHAR(100) NOT NULL,
    "credentials_ct" TEXT NOT NULL,
    "credentials_iv" VARCHAR(32) NOT NULL,
    "credentials_auth_tag" VARCHAR(32) NOT NULL,
    "credentials_salt" VARCHAR(64) NOT NULL,
    "scrape_lookback_days" INTEGER NOT NULL DEFAULT 60,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_synced_at" TIMESTAMP(6),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,
    "deleted_at" TIMESTAMP(6),

    CONSTRAINT "scraper_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_jobs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "scraper_connection_id" UUID,
    "status" VARCHAR(20) NOT NULL,
    "transactions_synced" INTEGER NOT NULL DEFAULT 0,
    "accounts_synced" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "started_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(6),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "sync_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_sync_secrets_user_id_key" ON "user_sync_secrets"("user_id");

-- CreateIndex
CREATE INDEX "user_sync_secrets_user_id_idx" ON "user_sync_secrets"("user_id");

-- CreateIndex
CREATE INDEX "scraper_connections_user_id_idx" ON "scraper_connections"("user_id");

-- CreateIndex
CREATE INDEX "scraper_connections_is_active_idx" ON "scraper_connections"("is_active");

-- CreateIndex
CREATE INDEX "scraper_connections_user_id_deleted_at_idx" ON "scraper_connections"("user_id", "deleted_at");

-- CreateIndex
CREATE INDEX "sync_jobs_user_id_idx" ON "sync_jobs"("user_id");

-- CreateIndex
CREATE INDEX "sync_jobs_status_idx" ON "sync_jobs"("status");

-- CreateIndex
CREATE INDEX "sync_jobs_user_id_status_idx" ON "sync_jobs"("user_id", "status");

-- AddForeignKey
ALTER TABLE "user_sync_secrets" ADD CONSTRAINT "user_sync_secrets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scraper_connections" ADD CONSTRAINT "scraper_connections_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_jobs" ADD CONSTRAINT "sync_jobs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_jobs" ADD CONSTRAINT "sync_jobs_scraper_connection_id_fkey" FOREIGN KEY ("scraper_connection_id") REFERENCES "scraper_connections"("id") ON DELETE SET NULL ON UPDATE CASCADE;
