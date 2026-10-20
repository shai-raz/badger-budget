import { Controller, Get, Post, Body, Patch, Param, Delete, HttpCode, HttpStatus, UseGuards } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from "@nestjs/swagger";
import { CategoryMappingRulesService } from "./category-mapping-rules.service";
import { CreateCategoryMappingRuleDto, UpdateCategoryMappingRuleDto } from "./dto/category-mapping-rule.dto";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";

@ApiTags("category-mapping-rules")
@Controller("category-mapping-rules")
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class CategoryMappingRulesController {
    constructor(private readonly categoryMappingRulesService: CategoryMappingRulesService) {}

    @Post()
    @ApiOperation({ summary: "Create a new category mapping rule" })
    @ApiResponse({ status: 201, description: "Rule created successfully" })
    create(@Body() createCategoryMappingRuleDto: CreateCategoryMappingRuleDto, @CurrentUser() user: any) {
        return this.categoryMappingRulesService.create(user.id, createCategoryMappingRuleDto);
    }

    @Get()
    @ApiOperation({ summary: "Get all category mapping rules (ordered by priority)" })
    @ApiResponse({ status: 200, description: "List of rules" })
    findAll(@CurrentUser() user: any) {
        return this.categoryMappingRulesService.findAll(user.id);
    }

    @Get(":id")
    @ApiOperation({ summary: "Get rule by ID" })
    @ApiResponse({ status: 200, description: "Rule found" })
    @ApiResponse({ status: 404, description: "Rule not found" })
    findOne(@Param("id") id: string, @CurrentUser() user: any) {
        return this.categoryMappingRulesService.findOne(id, user.id);
    }

    @Patch(":id")
    @ApiOperation({ summary: "Update rule" })
    @ApiResponse({ status: 200, description: "Rule updated successfully" })
    @ApiResponse({ status: 404, description: "Rule not found" })
    update(
        @Param("id") id: string,
        @Body() updateCategoryMappingRuleDto: UpdateCategoryMappingRuleDto,
        @CurrentUser() user: any,
    ) {
        return this.categoryMappingRulesService.update(id, user.id, updateCategoryMappingRuleDto);
    }

    @Delete(":id")
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiOperation({ summary: "Delete rule (soft delete)" })
    @ApiResponse({ status: 204, description: "Rule deleted successfully" })
    @ApiResponse({ status: 404, description: "Rule not found" })
    async remove(@Param("id") id: string, @CurrentUser() user: any) {
        await this.categoryMappingRulesService.remove(id, user.id);
    }

    @Post(":id/apply-all")
    @ApiOperation({ summary: "Apply rule to all matching transactions" })
    @ApiResponse({
        status: 200,
        description: "Rule applied successfully",
        schema: { properties: { count: { type: "number" } } },
    })
    @ApiResponse({ status: 404, description: "Rule not found" })
    async applyToAll(@Param("id") id: string, @CurrentUser() user: any) {
        const count = await this.categoryMappingRulesService.applyRuleToAllTransactions(id, user.id);
        return { count };
    }
}
