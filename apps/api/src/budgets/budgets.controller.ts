import {
    Controller,
    Get,
    Post,
    Body,
    Patch,
    Param,
    Query,
    Delete,
    HttpCode,
    HttpStatus,
    UseGuards,
} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from "@nestjs/swagger";
import { BudgetsService } from "./budgets.service";
import { CreateBudgetDto, UpdateBudgetDto, BudgetPeriodQueryDto } from "./dto/budget.dto";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";

@ApiTags("budgets")
@Controller("budgets")
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class BudgetsController {
    constructor(private readonly budgetsService: BudgetsService) {}

    @Post()
    @ApiOperation({ summary: "Create a new budget" })
    @ApiResponse({ status: 201, description: "Budget created successfully" })
    create(@Body() createBudgetDto: CreateBudgetDto, @CurrentUser() user: any) {
        return this.budgetsService.create(user.id, createBudgetDto);
    }

    @Get()
    @ApiOperation({ summary: "Get all budgets for current user" })
    @ApiResponse({ status: 200, description: "List of budgets" })
    findAll(@CurrentUser() user: any) {
        return this.budgetsService.findAll(user.id);
    }

    @Get("dashboard/summary")
    @ApiOperation({
        summary: "Get dashboard summary of all active budgets with analytics",
    })
    @ApiResponse({
        status: 200,
        description: "Dashboard summary retrieved successfully",
    })
    getDashboard(@CurrentUser() user: any, @Query() query: BudgetPeriodQueryDto) {
        return this.budgetsService.getDashboard(user.id, {
            period: query.period,
            periodOffset: query.periodOffset,
            timeZone: user.timeZone,
            locale: user.locale,
        });
    }

    @Get(":id")
    @ApiOperation({ summary: "Get budget by ID with transactions" })
    @ApiResponse({ status: 200, description: "Budget found" })
    @ApiResponse({ status: 404, description: "Budget not found" })
    findOne(@Param("id") id: string, @CurrentUser() user: any) {
        return this.budgetsService.findOne(id, user.id);
    }

    @Get(":id/analytics")
    @ApiOperation({ summary: "Get budget analytics with spending calculations" })
    @ApiResponse({
        status: 200,
        description: "Budget analytics retrieved successfully",
    })
    @ApiResponse({ status: 404, description: "Budget not found" })
    getAnalytics(@Param("id") id: string, @CurrentUser() user: any, @Query() query: BudgetPeriodQueryDto) {
        return this.budgetsService.getAnalytics(id, user.id, {
            periodOffset: query.periodOffset,
            timeZone: user.timeZone,
            locale: user.locale,
        });
    }

    @Patch(":id")
    @ApiOperation({ summary: "Update budget" })
    @ApiResponse({ status: 200, description: "Budget updated successfully" })
    @ApiResponse({ status: 404, description: "Budget not found" })
    update(@Param("id") id: string, @Body() updateBudgetDto: UpdateBudgetDto, @CurrentUser() user: any) {
        return this.budgetsService.update(id, user.id, updateBudgetDto);
    }

    @Delete(":id")
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiOperation({ summary: "Delete budget (soft delete)" })
    @ApiResponse({ status: 204, description: "Budget deleted successfully" })
    @ApiResponse({ status: 404, description: "Budget not found" })
    async remove(@Param("id") id: string, @CurrentUser() user: any) {
        await this.budgetsService.remove(id, user.id);
    }
}
