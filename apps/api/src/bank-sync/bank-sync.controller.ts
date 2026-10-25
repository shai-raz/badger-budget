import {
    Controller,
    Get,
    Post,
    Body,
    Patch,
    Param,
    Delete,
    HttpCode,
    HttpStatus,
    UseGuards,
    ParseUUIDPipe,
} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from "@nestjs/swagger";
import { BankSyncService } from "./bank-sync.service";
import {
    SetSyncPinDto,
    CreateScraperConnectionDto,
    UpdateScraperConnectionDto,
    TriggerSyncDto,
    RegisterSyncPasskeyDto,
} from "./dto";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";

@ApiTags("bank-sync")
@Controller("bank-sync")
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class BankSyncController {
    constructor(private readonly bankSyncService: BankSyncService) {}

    @Post("pin")
    @ApiOperation({ summary: "Set or change the sync PIN" })
    @ApiResponse({ status: 200, description: "Sync PIN set successfully" })
    async setSyncPin(@Body() dto: SetSyncPinDto, @CurrentUser() user: any) {
        await this.bankSyncService.setPinOrChange(user.id, dto.pin);
        return { message: "Sync PIN set successfully" };
    }

    @Get("pin/status")
    @ApiOperation({ summary: "Get sync PIN status" })
    @ApiResponse({ status: 200, description: "Returns whether a sync PIN has been set" })
    getSyncPinStatus(@CurrentUser() user: any) {
        return this.bankSyncService.getSyncPinStatus(user.id);
    }

    @Get("passkeys")
    @ApiOperation({ summary: "List registered sync passkeys" })
    @ApiResponse({ status: 200, description: "List of sync passkeys" })
    getPasskeys(@CurrentUser() user: any) {
        return this.bankSyncService.listPasskeys(user.id);
    }

    @Post("passkeys")
    @HttpCode(HttpStatus.CREATED)
    @ApiOperation({ summary: "Register a sync passkey (requires the current PIN)" })
    @ApiResponse({ status: 201, description: "Sync passkey registered" })
    @ApiResponse({ status: 400, description: "Invalid input, no PIN set, or passkey limit reached" })
    @ApiResponse({ status: 401, description: "Invalid PIN" })
    @ApiResponse({ status: 409, description: "Passkey already registered" })
    registerPasskey(@Body() dto: RegisterSyncPasskeyDto, @CurrentUser() user: any) {
        return this.bankSyncService.registerPasskey(user.id, dto);
    }

    @Delete("passkeys/:id")
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiOperation({ summary: "Delete a sync passkey" })
    @ApiResponse({ status: 204, description: "Sync passkey deleted" })
    @ApiResponse({ status: 404, description: "Passkey not found" })
    async deletePasskey(@Param("id", ParseUUIDPipe) id: string, @CurrentUser() user: any) {
        await this.bankSyncService.deletePasskey(user.id, id);
    }

    @Get("connections")
    @ApiOperation({ summary: "Get all scraper connections for current user" })
    @ApiResponse({ status: 200, description: "List of scraper connections" })
    getConnections(@CurrentUser() user: any) {
        return this.bankSyncService.getConnections(user.id);
    }

    @Post("connections")
    @HttpCode(HttpStatus.CREATED)
    @ApiOperation({ summary: "Create a new scraper connection" })
    @ApiResponse({ status: 201, description: "Scraper connection created successfully" })
    createConnection(@Body() dto: CreateScraperConnectionDto, @CurrentUser() user: any) {
        return this.bankSyncService.createConnection(user.id, dto);
    }

    @Patch("connections/:id")
    @ApiOperation({ summary: "Update a scraper connection" })
    @ApiResponse({ status: 200, description: "Scraper connection updated successfully" })
    @ApiResponse({ status: 404, description: "Scraper connection not found" })
    updateConnection(@Param("id") id: string, @Body() dto: UpdateScraperConnectionDto, @CurrentUser() user: any) {
        return this.bankSyncService.updateConnection(user.id, id, dto);
    }

    @Delete("connections/:id")
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiOperation({ summary: "Delete a scraper connection (soft delete)" })
    @ApiResponse({ status: 204, description: "Scraper connection deleted successfully" })
    @ApiResponse({ status: 404, description: "Scraper connection not found" })
    async deleteConnection(@Param("id") id: string, @CurrentUser() user: any) {
        await this.bankSyncService.deleteConnection(user.id, id);
    }

    @Post("connections/:id/sync")
    @ApiOperation({ summary: "Trigger a background sync for one active connection" })
    @ApiResponse({ status: 201, description: "Sync started; returns jobId" })
    @ApiResponse({ status: 400, description: "Connection paused or no PIN configured" })
    @ApiResponse({ status: 401, description: "Invalid PIN" })
    @ApiResponse({ status: 404, description: "Connection not found" })
    @ApiResponse({ status: 409, description: "A sync is already in progress" })
    triggerConnectionSync(
        @Param("id", ParseUUIDPipe) id: string,
        @Body() dto: TriggerSyncDto,
        @CurrentUser() user: { id: string },
    ) {
        return this.bankSyncService.triggerConnectionSync(user.id, id, dto.pin, dto.defaultCurrencyCode);
    }

    @Post("sync")
    @ApiOperation({ summary: "Trigger a background bank sync for all active connections" })
    @ApiResponse({
        status: 201,
        description: "Sync job created",
        schema: { properties: { jobId: { type: "string" } } },
    })
    async triggerSync(@CurrentUser() user: any, @Body() body: TriggerSyncDto) {
        return this.bankSyncService.triggerSync(user.id, body.pin, body.defaultCurrencyCode);
    }

    @Get("sync/active")
    @ApiOperation({ summary: "Get the currently active (pending/running) sync job, if any" })
    @ApiResponse({ status: 200, description: "Active sync job or null" })
    async getActiveJob(@CurrentUser() user: any) {
        return this.bankSyncService.getActiveJob(user.id);
    }

    @Get("sync/jobs/:id")
    @ApiOperation({ summary: "Get a sync job by ID" })
    @ApiResponse({ status: 200, description: "Sync job details" })
    @ApiResponse({ status: 404, description: "Sync job not found" })
    async getJob(@CurrentUser() user: any, @Param("id") id: string) {
        return this.bankSyncService.getJob(user.id, id);
    }
}
