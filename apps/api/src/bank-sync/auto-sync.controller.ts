import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Patch, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import type { IAutoSyncState, IAutoSyncStatus } from "@badger/types";
import { AutoSyncService } from "./auto-sync.service";
import { EnableAutoSyncDto, UpdateAutoSyncScheduleDto } from "./dto";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";

@ApiTags("bank-sync")
@Controller("bank-sync/auto-sync")
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AutoSyncController {
    constructor(private readonly autoSyncService: AutoSyncService) {}

    @Post()
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: "Turn on automatic bank sync (requires the sync PIN)" })
    @ApiResponse({ status: 200, description: "Auto-sync is on; returns its status" })
    @ApiResponse({ status: 400, description: "Invalid schedule, time zone or duration, or no active connections" })
    @ApiResponse({ status: 401, description: "Invalid PIN" })
    enable(@Body() dto: EnableAutoSyncDto, @CurrentUser() user: { id: string }): Promise<IAutoSyncStatus> {
        return this.autoSyncService.enable(user.id, dto);
    }

    @Get()
    @ApiOperation({ summary: "Get the current automatic bank sync grant, if any" })
    @ApiResponse({ status: 200, description: "Auto-sync status, or null when it is off or expired" })
    async getStatus(@CurrentUser() user: { id: string }): Promise<IAutoSyncState> {
        return { autoSync: await this.autoSyncService.getStatus(user.id) };
    }

    @Patch()
    @ApiOperation({ summary: "Change the automatic bank sync schedule" })
    @ApiResponse({ status: 200, description: "Updated auto-sync status" })
    @ApiResponse({ status: 400, description: "Invalid schedule or time zone" })
    @ApiResponse({ status: 404, description: "Auto-sync is not on" })
    updateSchedule(
        @Body() dto: UpdateAutoSyncScheduleDto,
        @CurrentUser() user: { id: string },
    ): Promise<IAutoSyncStatus> {
        return this.autoSyncService.updateSchedule(user.id, dto);
    }

    @Delete()
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiOperation({ summary: "Turn off automatic bank sync" })
    @ApiResponse({ status: 204, description: "Auto-sync is off" })
    async disable(@CurrentUser() user: { id: string }): Promise<void> {
        await this.autoSyncService.disable(user.id);
    }
}
