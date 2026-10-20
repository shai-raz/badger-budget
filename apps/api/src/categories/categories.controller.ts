import { Controller, Get, Post, Body, Patch, Param, Delete, HttpCode, HttpStatus, UseGuards } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from "@nestjs/swagger";
import { CategoriesService } from "./categories.service";
import { CreateCategoryDto, UpdateCategoryDto, DeleteCategoryDto } from "./dto/category.dto";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";

@ApiTags("categories")
@Controller("categories")
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class CategoriesController {
    constructor(private readonly categoriesService: CategoriesService) {}

    @Post()
    @ApiOperation({ summary: "Create a new category" })
    @ApiResponse({ status: 201, description: "Category created successfully" })
    create(@Body() createCategoryDto: CreateCategoryDto, @CurrentUser() user: any) {
        return this.categoriesService.create(user.id, createCategoryDto);
    }

    @Get()
    @ApiOperation({ summary: "Get all categories (system + user)" })
    @ApiResponse({ status: 200, description: "List of categories" })
    findAll(@CurrentUser() user: any) {
        return this.categoriesService.findAll(user.id);
    }

    @Get(":id")
    @ApiOperation({ summary: "Get category by ID" })
    @ApiResponse({ status: 200, description: "Category found" })
    @ApiResponse({ status: 404, description: "Category not found" })
    findOne(@Param("id") id: string, @CurrentUser() user: any) {
        return this.categoriesService.findOne(id, user.id);
    }

    @Get(":id/usage")
    @ApiOperation({ summary: "Get category usage counts" })
    @ApiResponse({ status: 200, description: "Category usage counts retrieved" })
    @ApiResponse({ status: 404, description: "Category not found" })
    async getUsage(@Param("id") id: string, @CurrentUser() user: any) {
        return this.categoriesService.getUsageCount(id, user.id);
    }

    @Patch(":id")
    @ApiOperation({ summary: "Update category (user categories only)" })
    @ApiResponse({ status: 200, description: "Category updated successfully" })
    @ApiResponse({ status: 403, description: "Cannot update system categories" })
    @ApiResponse({ status: 404, description: "Category not found" })
    update(@Param("id") id: string, @Body() updateCategoryDto: UpdateCategoryDto, @CurrentUser() user: any) {
        return this.categoriesService.update(id, user.id, updateCategoryDto);
    }

    @Delete(":id")
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiOperation({ summary: "Delete category (user categories only)" })
    @ApiResponse({ status: 204, description: "Category deleted successfully" })
    @ApiResponse({ status: 403, description: "Cannot delete system categories" })
    @ApiResponse({ status: 404, description: "Category not found" })
    async remove(@Param("id") id: string, @Body() deleteCategoryDto: DeleteCategoryDto, @CurrentUser() user: any) {
        await this.categoriesService.remove(id, user.id, deleteCategoryDto);
    }
}
