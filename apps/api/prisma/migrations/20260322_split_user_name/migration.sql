-- Add firstName and lastName columns to users table
ALTER TABLE "users"
ADD COLUMN "first_name" VARCHAR(255) NOT NULL DEFAULT '';

ALTER TABLE "users"
ADD COLUMN "last_name" VARCHAR(255) NOT NULL DEFAULT '';

-- Migrate existing data: split name into firstName and lastName
UPDATE "users"
SET
    "first_name" = COALESCE(
        SPLIT_PART ("name", ' ', 1),
        ''
    ),
    "last_name" = COALESCE(
        TRIM(
            SUBSTR(
                "name",
                POSITION(' ' IN "name") + 1
            )
        ),
        ''
    )
WHERE
    "name" IS NOT NULL;

-- Remove the old name column
ALTER TABLE "users" DROP COLUMN "name";

-- Remove the default constraint (they should now have actual values or defaults)
ALTER TABLE "users" ALTER COLUMN "first_name" DROP DEFAULT;

ALTER TABLE "users" ALTER COLUMN "last_name" DROP DEFAULT;