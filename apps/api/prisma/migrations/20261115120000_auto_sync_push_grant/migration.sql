-- Phase A grants have no push subscription, so they cannot run; drop them (their credential copies cascade).
DELETE FROM "auto_sync_grants";

-- AlterTable
ALTER TABLE "auto_sync_grants" ADD COLUMN     "expiry_warned_at" TIMESTAMP(6),
ADD COLUMN     "push_subscription_id" UUID NOT NULL;

-- CreateIndex
CREATE INDEX "auto_sync_grants_push_subscription_id_idx" ON "auto_sync_grants"("push_subscription_id");

-- AddForeignKey
ALTER TABLE "auto_sync_grants" ADD CONSTRAINT "auto_sync_grants_push_subscription_id_fkey" FOREIGN KEY ("push_subscription_id") REFERENCES "push_subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
