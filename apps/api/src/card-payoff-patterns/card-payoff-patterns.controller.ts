import {
    Controller,
    Get,
    Post,
    Body,
    Delete,
    Param,
    Query,
    HttpCode,
    HttpStatus,
    UseGuards,
    BadRequestException,
} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from "@nestjs/swagger";
import { CardPayoffPatternsService } from "./card-payoff-patterns.service";
import { CreateCardPayoffPatternDto } from "./dto/create-card-payoff-pattern.dto";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";

@ApiTags("card-payoff-patterns")
@Controller("card-payoff-patterns")
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class CardPayoffPatternsController {
    constructor(private readonly cardPayoffPatternsService: CardPayoffPatternsService) {}

    @Post()
    @ApiOperation({ summary: "Create a new card payoff pattern" })
    @ApiResponse({ status: 201, description: "Pattern created successfully" })
    create(@Body() createDto: CreateCardPayoffPatternDto, @CurrentUser() user: any) {
        return this.cardPayoffPatternsService.create(user.id, createDto);
    }

    @Get()
    @ApiOperation({ summary: "Get all card payoff patterns (system + user)" })
    @ApiResponse({ status: 200, description: "List of patterns" })
    findAll(@CurrentUser() user: any) {
        return this.cardPayoffPatternsService.findAll(user.id);
    }

    // Preview routes must stay above `:id`, or Nest matches "link-preview" as a pattern id.
    @Get("link-preview")
    @ApiOperation({ summary: "Preview reimbursement links a card payoff description would remove" })
    @ApiQuery({ name: "description", required: true, type: String })
    @ApiResponse({ status: 200, description: "Linked transaction and link counts" })
    @ApiResponse({ status: 400, description: "description is required" })
    previewLinkRemoval(@Query("description") description: string, @CurrentUser() user: { id: string }) {
        if (!description?.trim()) throw new BadRequestException("description is required");
        return this.cardPayoffPatternsService.previewLinkRemoval(user.id, [description]);
    }

    @Get("apply-all/link-preview")
    @ApiOperation({ summary: "Preview reimbursement links that applying all patterns would remove" })
    @ApiResponse({ status: 200, description: "Linked transaction and link counts" })
    previewApplyAllLinkRemoval(@CurrentUser() user: { id: string }) {
        return this.cardPayoffPatternsService.previewApplyAllLinkRemoval(user.id);
    }

    @Get(":id")
    @ApiOperation({ summary: "Get pattern by ID" })
    @ApiResponse({ status: 200, description: "Pattern found" })
    @ApiResponse({ status: 404, description: "Pattern not found" })
    findOne(@Param("id") id: string, @CurrentUser() user: any) {
        return this.cardPayoffPatternsService.findOne(id, user.id);
    }

    @Post("apply-all")
    @ApiOperation({
        summary: "Apply all patterns: matching transactions become hidden transfers and lose their reimbursement links",
    })
    @ApiResponse({ status: 200, description: "Patterns applied; response has count and linksRemoved" })
    async applyAllPatterns(@CurrentUser() user: any) {
        return this.cardPayoffPatternsService.applyAllPatternsToTransactions(user.id);
    }

    @Delete(":id")
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiOperation({ summary: "Delete pattern (user patterns only)" })
    @ApiResponse({ status: 204, description: "Pattern deleted successfully" })
    @ApiResponse({ status: 403, description: "Cannot delete system patterns" })
    @ApiResponse({ status: 404, description: "Pattern not found" })
    async remove(@Param("id") id: string, @CurrentUser() user: any) {
        await this.cardPayoffPatternsService.remove(id, user.id);
    }
}
