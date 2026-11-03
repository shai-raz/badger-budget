ALTER TABLE "scraper_jobs" ADD COLUMN "error_code" VARCHAR(40);

CREATE INDEX "sync_jobs_user_id_started_at_idx" ON "sync_jobs"("user_id", "started_at");
