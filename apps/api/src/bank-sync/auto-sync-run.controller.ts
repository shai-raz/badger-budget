import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { Throttle, ThrottlerGuard } from "@nestjs/throttler";
import { AutoSyncService } from "./auto-sync.service";
import { RunAutoSyncDto } from "./dto";

const MINUTE_MS = 60_000;

/** Public: a scheduled run proves itself with its grant's device key and one-time token, not a session. */
@ApiTags("bank-sync")
@Controller("bank-sync/auto-sync/run")
@UseGuards(ThrottlerGuard)
export class AutoSyncRunController {
    constructor(private readonly autoSyncService: AutoSyncService) {}

    @Post()
    @Throttle({ default: { limit: 10, ttl: MINUTE_MS } })
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: "Start a scheduled automatic bank sync" })
    @ApiResponse({ status: 200, description: "Sync job started" })
    @ApiResponse({ status: 401, description: "Run rejected" })
    run(@Body() dto: RunAutoSyncDto): Promise<{ jobId: string }> {
        return this.autoSyncService.run(dto);
    }
}
