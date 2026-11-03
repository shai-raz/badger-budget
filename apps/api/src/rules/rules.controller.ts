import {
    Body,
    Controller,
    Delete,
    Get,
    HttpCode,
    HttpStatus,
    Param,
    ParseUUIDPipe,
    Patch,
    Post,
    Put,
    UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import type { ApplyRuleResponse, IRule, RulePreviewResponse, RuleSaveResponse } from "@badger/types";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import {
    ApplyRuleSelectionDto,
    CreateRuleDto,
    ReorderRulesDto,
    RulePreviewDto,
    SetRuleActiveDto,
    UpdateRuleDto,
} from "./dto/rule.dto";
import { RulesService } from "./rules.service";

@ApiTags("rules")
@Controller("rules")
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class RulesController {
    constructor(private readonly rulesService: RulesService) {}

    @Get()
    @ApiOperation({ summary: "List the user's rules in priority order" })
    @ApiResponse({ status: 200, description: "List of rules" })
    findAll(@CurrentUser() user: { id: string }): Promise<IRule[]> {
        return this.rulesService.findAll(user.id);
    }

    @Get(":id")
    @ApiOperation({ summary: "Get a rule by ID" })
    @ApiResponse({ status: 200, description: "Rule found" })
    @ApiResponse({ status: 404, description: "Rule not found" })
    findOne(@Param("id", ParseUUIDPipe) id: string, @CurrentUser() user: { id: string }): Promise<IRule> {
        return this.rulesService.findOne(id, user.id);
    }

    @Post()
    @ApiOperation({ summary: "Create a rule, optionally applying it to matching transactions" })
    @ApiResponse({ status: 201, description: "Rule created" })
    create(@Body() dto: CreateRuleDto, @CurrentUser() user: { id: string }): Promise<RuleSaveResponse> {
        return this.rulesService.create(user.id, dto);
    }

    @Post("preview")
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: "Preview the transactions a draft rule would change" })
    @ApiResponse({ status: 200, description: "Preview page" })
    preview(@Body() dto: RulePreviewDto, @CurrentUser() user: { id: string }): Promise<RulePreviewResponse> {
        return this.rulesService.preview(user.id, dto);
    }

    @Put(":id")
    @ApiOperation({
        summary: "Replace a rule's name, stop flag, conditions and actions, optionally applying it",
    })
    @ApiResponse({ status: 200, description: "Rule updated" })
    @ApiResponse({ status: 404, description: "Rule not found" })
    update(
        @Param("id", ParseUUIDPipe) id: string,
        @Body() dto: UpdateRuleDto,
        @CurrentUser() user: { id: string },
    ): Promise<RuleSaveResponse> {
        return this.rulesService.update(id, user.id, dto);
    }

    @Post(":id/apply")
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: "Apply a saved rule to the selected transactions it would change" })
    @ApiResponse({ status: 200, description: "Number of transactions changed" })
    @ApiResponse({ status: 404, description: "Rule not found" })
    apply(
        @Param("id", ParseUUIDPipe) id: string,
        @Body() dto: ApplyRuleSelectionDto,
        @CurrentUser() user: { id: string },
    ): Promise<ApplyRuleResponse> {
        return this.rulesService.apply(id, user.id, dto);
    }

    @Patch(":id/active")
    @ApiOperation({ summary: "Turn a rule on or off" })
    @ApiResponse({ status: 200, description: "Rule updated" })
    @ApiResponse({ status: 404, description: "Rule not found" })
    setActive(
        @Param("id", ParseUUIDPipe) id: string,
        @Body() dto: SetRuleActiveDto,
        @CurrentUser() user: { id: string },
    ): Promise<IRule> {
        return this.rulesService.setActive(id, user.id, dto.isActive);
    }

    @Post("reorder")
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiOperation({ summary: "Set the priority order of every rule" })
    @ApiResponse({ status: 204, description: "Order saved" })
    @ApiResponse({ status: 409, description: "The rule list changed since it was loaded" })
    async reorder(@Body() dto: ReorderRulesDto, @CurrentUser() user: { id: string }): Promise<void> {
        await this.rulesService.reorder(user.id, dto.ids);
    }

    @Delete(":id")
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiOperation({ summary: "Delete a rule (soft delete)" })
    @ApiResponse({ status: 204, description: "Rule deleted" })
    @ApiResponse({ status: 404, description: "Rule not found" })
    async remove(@Param("id", ParseUUIDPipe) id: string, @CurrentUser() user: { id: string }): Promise<void> {
        await this.rulesService.remove(id, user.id);
    }
}
