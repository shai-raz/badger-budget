import { Controller, Get, UseGuards } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from "@nestjs/swagger";
import { CashWithdrawalPatternsService } from "./cash-withdrawal-patterns.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";

@ApiTags("cash-withdrawal-patterns")
@Controller("cash-withdrawal-patterns")
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class CashWithdrawalPatternsController {
    constructor(private readonly cashWithdrawalPatternsService: CashWithdrawalPatternsService) {}

    @Get()
    @ApiOperation({ summary: "Get all cash withdrawal patterns (system + user)" })
    @ApiResponse({ status: 200, description: "List of patterns" })
    findAll(@CurrentUser() user: any) {
        return this.cashWithdrawalPatternsService.findAll(user.id);
    }
}
