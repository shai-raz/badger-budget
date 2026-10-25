import { Module } from "@nestjs/common";
import { CategoriesService } from "./categories.service";
import { CategoriesController } from "./categories.controller";
import { CategoryIconBackfillService } from "./category-icon-backfill.service";

@Module({
    controllers: [CategoriesController],
    providers: [CategoriesService, CategoryIconBackfillService],
    exports: [CategoriesService],
})
export class CategoriesModule {}
