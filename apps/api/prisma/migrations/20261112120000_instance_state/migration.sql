-- CreateTable
CREATE TABLE "instance_state" (
    "key" VARCHAR(100) NOT NULL,
    "value" JSONB NOT NULL,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "instance_state_pkey" PRIMARY KEY ("key")
);
