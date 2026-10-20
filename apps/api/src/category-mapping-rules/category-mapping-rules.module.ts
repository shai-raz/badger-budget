import { Module } from "@nestjs/common";
import { CategoryMappingRulesService } from "./category-mapping-rules.service";
import { CategoryMappingRulesController } from "./category-mapping-rules.controller";

@Module({
    controllers: [CategoryMappingRulesController],
    providers: [CategoryMappingRulesService],
    exports: [CategoryMappingRulesService],
})
export class CategoryMappingRulesModule {}
