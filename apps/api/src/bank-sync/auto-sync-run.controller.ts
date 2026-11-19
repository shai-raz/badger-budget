import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { Throttle, ThrottlerGuard } from "@nestjs/throttler";
import { AutoSyncService } from "./auto-sync.service";
import { MoveAutoSyncDeviceDto, RunAutoSyncDto } from "./dto";

const MINUTE_MS = 60_000;

/** Public: these routes prove themselves with the grant's device key (and a run its one-time token), not a session. */
@ApiTags("bank-sync")
@Controller("bank-sync/auto-sync")
@UseGuards(ThrottlerGuard)
export class AutoSyncRunController {
    constructor(private readonly autoSyncService: AutoSyncService) {}

    @Post("run")
    @Throttle({ default: { limit: 10, ttl: MINUTE_MS } })
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: "Start a scheduled automatic bank sync" })
    @ApiResponse({ status: 200, description: "Sync job started" })
    @ApiResponse({ status: 400, description: "Invalid input, or no covered connection to sync" })
    @ApiResponse({ status: 401, description: "Run rejected" })
    @ApiResponse({ status: 409, description: "A sync is already in progress" })
    run(@Body() dto: RunAutoSyncDto): Promise<{ jobId: string }> {
        return this.autoSyncService.run(dto);
    }

    @Post("device")
    @Throttle({ default: { limit: 10, ttl: MINUTE_MS } })
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiOperation({ summary: "Point automatic bank sync at this browser's current push subscription" })
    @ApiResponse({ status: 204, description: "Auto-sync pushes to this subscription" })
    @ApiResponse({ status: 400, description: "Invalid input" })
    @ApiResponse({ status: 401, description: "Device rejected" })
    async moveDevice(@Body() dto: MoveAutoSyncDeviceDto): Promise<void> {
        await this.autoSyncService.moveDevice(dto);
    }
}
