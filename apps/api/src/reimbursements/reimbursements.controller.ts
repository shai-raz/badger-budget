import {
    Body,
    Controller,
    Delete,
    HttpCode,
    HttpStatus,
    Get,
    Param,
    ParseUUIDPipe,
    Patch,
    Post,
    Query,
    UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from "@nestjs/swagger";
import { ReimbursementsService } from "./reimbursements.service";
import { ReimbursementCandidatesResponseDto } from "./dto/reimbursement-candidates-response.dto";
import { CreateReimbursementAllocationDto } from "./dto/create-reimbursement-allocation.dto";
import { UpdateReimbursementAllocationDto } from "./dto/update-reimbursement-allocation.dto";
import { ReimbursementAllocationResponseDto } from "./dto/reimbursement-allocation-response.dto";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";

@ApiTags("reimbursements")
@Controller("reimbursements")
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ReimbursementsController {
    constructor(private readonly reimbursementsService: ReimbursementsService) {}

    @Get("candidates")
    @ApiOperation({ summary: "Find transactions a reimbursement picker can link to this one" })
    @ApiQuery({ name: "transactionId", format: "uuid", required: true })
    @ApiQuery({ name: "search", required: false, description: "Text, or an amount such as 1200 or ₪1,200" })
    @ApiResponse({ status: 200, type: ReimbursementCandidatesResponseDto })
    @ApiResponse({ status: 400, description: "Transfer or hidden transaction" })
    @ApiResponse({ status: 404, description: "Transaction not found" })
    candidates(
        @Query("transactionId", ParseUUIDPipe) transactionId: string,
        @Query("search") search: string | undefined,
        @CurrentUser() user: { id: string },
    ) {
        return this.reimbursementsService.getCandidates(user.id, transactionId, search);
    }

    @Post()
    @ApiOperation({ summary: "Link an income to an expense it pays back" })
    @ApiResponse({ status: 201, type: ReimbursementAllocationResponseDto })
    @ApiResponse({ status: 400, description: "Invalid link, or the amount exceeds a remaining balance" })
    @ApiResponse({ status: 404, description: "Transaction not found" })
    create(@Body() dto: CreateReimbursementAllocationDto, @CurrentUser() user: { id: string }) {
        return this.reimbursementsService.create(user.id, dto);
    }

    @Patch(":id")
    @ApiOperation({ summary: "Change the amount of a reimbursement allocation" })
    @ApiResponse({ status: 200, type: ReimbursementAllocationResponseDto })
    @ApiResponse({ status: 400, description: "The amount exceeds a remaining balance" })
    @ApiResponse({ status: 404, description: "Allocation not found" })
    update(
        @Param("id", ParseUUIDPipe) id: string,
        @Body() dto: UpdateReimbursementAllocationDto,
        @CurrentUser() user: { id: string },
    ) {
        return this.reimbursementsService.update(user.id, id, dto);
    }

    @Delete(":id")
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiOperation({ summary: "Unlink a reimbursement allocation" })
    @ApiResponse({ status: 204, description: "Allocation removed" })
    @ApiResponse({ status: 404, description: "Allocation not found" })
    async remove(@Param("id", ParseUUIDPipe) id: string, @CurrentUser() user: { id: string }) {
        await this.reimbursementsService.remove(user.id, id);
    }
}
