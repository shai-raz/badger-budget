/*
  Warnings:

  - A unique constraint covering the columns `[user_id,name,deleted_at]` on the table `categories` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "categories_user_id_name_deleted_at_key" ON "categories"("user_id", "name", "deleted_at");
