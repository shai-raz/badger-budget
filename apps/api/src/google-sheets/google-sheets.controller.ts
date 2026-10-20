import { Controller, Post, Get, Delete, Body, UseGuards, HttpCode, HttpStatus } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from "@nestjs/swagger";
import { GoogleSheetsService } from "./google-sheets.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { ConnectSheetDto, SyncResultDto, SheetConnectionDto, SyncSheetDto, BackfillCurrenciesDto } from "./dto";

@ApiTags("google-sheets")
@Controller("google-sheets")
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class GoogleSheetsController {
    constructor(private readonly googleSheetsService: GoogleSheetsService) {}

    @Post("connect")
    @ApiOperation({
        summary: "Connect a Google Sheet",
        description: "Link a Google Sheet for transaction sync. Sheet must be shared with the service account.",
    })
    @ApiResponse({
        status: 201,
        description: "Sheet connected successfully",
        type: SheetConnectionDto,
    })
    @ApiResponse({
        status: 400,
        description: "Cannot access sheet - check sharing permissions",
    })
    async connectSheet(@CurrentUser() user: any, @Body() dto: ConnectSheetDto): Promise<SheetConnectionDto> {
        return this.googleSheetsService.connectSheet(user.id, dto.spreadsheetId, dto.sheetName || "Sheet1");
    }

    @Get("status")
    @ApiOperation({
        summary: "Get sheet connection status",
        description: "Retrieve the current Google Sheet connection details",
    })
    @ApiResponse({
        status: 200,
        description: "Connection status retrieved",
        type: SheetConnectionDto,
    })
    @ApiResponse({
        status: 404,
        description: "No active sheet connection found",
    })
    async getStatus(@CurrentUser() user: any): Promise<SheetConnectionDto> {
        return this.googleSheetsService.getConnection(user.id);
    }

    @Post("sync")
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: "Sync transactions from Google Sheet",
        description: "Read transactions from the connected sheet and import new ones",
    })
    @ApiResponse({
        status: 200,
        description: "Sync completed",
        type: SyncResultDto,
    })
    @ApiResponse({
        status: 404,
        description: "No active sheet connection found",
    })
    async syncTransactions(@CurrentUser() user: any, @Body() dto: SyncSheetDto = {}): Promise<SyncResultDto> {
        return this.googleSheetsService.syncTransactions(user.id, dto.defaultCurrencyCode);
    }

    @Post("backfill-currencies")
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: "One-time currency backfill",
        description:
            "Runs once per user. Sets account currencies and fixes the currency/originalAmount on historical transactions by re-reading the connected sheet. No-ops if already run.",
    })
    @ApiResponse({
        status: 200,
        description: "Backfill complete (or skipped if already done)",
    })
    async backfillCurrencies(
        @CurrentUser() user: any,
        @Body() dto: BackfillCurrenciesDto = {},
    ): Promise<{ skipped: boolean }> {
        return this.googleSheetsService.backfillCurrenciesOnce(user.id, dto.defaultCurrencyCode);
    }

    @Delete("disconnect")
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiOperation({
        summary: "Disconnect Google Sheet",
        description: "Deactivate the current sheet connection",
    })
    @ApiResponse({
        status: 204,
        description: "Sheet disconnected successfully",
    })
    async disconnectSheet(@CurrentUser() user: any): Promise<void> {
        await this.googleSheetsService.disconnectSheet(user.id);
    }
}
