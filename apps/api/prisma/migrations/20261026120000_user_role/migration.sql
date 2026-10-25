-- Admin role. Backfill: the oldest live non-demo user becomes ADMIN, so an existing install keeps one admin.
-- The demo email below must match DEMO_EMAIL in src/demo/demo-data.constants.ts (the demo user is never ADMIN).
CREATE TYPE "UserRole" AS ENUM ('USER', 'ADMIN');
ALTER TABLE "users" ADD COLUMN "role" "UserRole" NOT NULL DEFAULT 'USER';
UPDATE "users" SET "role" = 'ADMIN' WHERE "id" = (SELECT "id" FROM "users" WHERE "deleted_at" IS NULL AND "email" <> 'demo@demo.demo' ORDER BY "created_at" ASC, "id" ASC LIMIT 1);
