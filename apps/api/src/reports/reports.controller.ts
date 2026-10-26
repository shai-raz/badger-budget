import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { ReportsService } from "./reports.service";
import { SpendingReportQueryDto } from "./dto/spending-report-query.dto";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";

@ApiTags("reports")
@Controller("reports")
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ReportsController {
    constructor(private readonly reportsService: ReportsService) {}

    @Get("spending")
    @ApiOperation({
        summary:
            "Get a spending report (total, per-category breakdown, comparison vs the previous period or the year before, per `compare`) for a date range",
    })
    @ApiResponse({
        status: 200,
        description: "Spending report retrieved successfully",
    })
    getSpendingReport(@CurrentUser() user: { id: string }, @Query() query: SpendingReportQueryDto) {
        return this.reportsService.getSpendingReport(user.id, query);
    }
}
