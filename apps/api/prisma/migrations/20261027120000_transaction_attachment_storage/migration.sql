-- Metadata-only rows never held a file.
DELETE FROM "transaction_attachments" WHERE "storage_key" IS NULL;
ALTER TABLE "transaction_attachments" ALTER COLUMN "storage_key" SET NOT NULL;
ALTER TABLE "transaction_attachments" ADD COLUMN "thumbnail_key" VARCHAR(512);
