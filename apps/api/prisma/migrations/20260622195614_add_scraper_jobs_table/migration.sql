/*
  Warnings:

  - You are about to drop the column `scraper_connection_id` on the `sync_jobs` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "sync_jobs" DROP CONSTRAINT "sync_jobs_scraper_connection_id_fkey";

-- AlterTable
ALTER TABLE "sync_jobs" DROP COLUMN "scraper_connection_id";

-- CreateTable
CREATE TABLE "scraper_jobs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sync_job_id" UUID NOT NULL,
    "scraper_connection_id" UUID,
    "company_id" VARCHAR(50) NOT NULL,
    "display_name" VARCHAR(100) NOT NULL,
    "status" VARCHAR(20) NOT NULL,
    "transactions_synced" INTEGER NOT NULL DEFAULT 0,
    "accounts_synced" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "started_at" TIMESTAMP(6),
    "finished_at" TIMESTAMP(6),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "scraper_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "scraper_jobs_sync_job_id_idx" ON "scraper_jobs"("sync_job_id");

-- CreateIndex
CREATE INDEX "scraper_jobs_scraper_connection_id_idx" ON "scraper_jobs"("scraper_connection_id");

-- AddForeignKey
ALTER TABLE "scraper_jobs" ADD CONSTRAINT "scraper_jobs_sync_job_id_fkey" FOREIGN KEY ("sync_job_id") REFERENCES "sync_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scraper_jobs" ADD CONSTRAINT "scraper_jobs_scraper_connection_id_fkey" FOREIGN KEY ("scraper_connection_id") REFERENCES "scraper_connections"("id") ON DELETE SET NULL ON UPDATE CASCADE;
