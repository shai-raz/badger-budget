-- CreateTable
CREATE TABLE "sync_passkeys" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "credential_id" VARCHAR(1400) NOT NULL,
    "prf_salt" VARCHAR(64) NOT NULL,
    "wrapped_pin_ct" TEXT NOT NULL,
    "wrapped_pin_iv" VARCHAR(32) NOT NULL,
    "label" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sync_passkeys_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sync_passkeys_credential_id_key" ON "sync_passkeys"("credential_id");

-- CreateIndex
CREATE INDEX "sync_passkeys_user_id_idx" ON "sync_passkeys"("user_id");

-- AddForeignKey
ALTER TABLE "sync_passkeys" ADD CONSTRAINT "sync_passkeys_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
