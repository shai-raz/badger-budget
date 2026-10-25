-- CreateTable
CREATE TABLE "data_backfills" (
    "name" VARCHAR(100) NOT NULL,
    "applied_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "data_backfills_pkey" PRIMARY KEY ("name")
);
