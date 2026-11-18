import { Controller, Get, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import type { ISettingsSummary } from "@badger/types";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { SettingsService } from "./settings.service";

@ApiTags("settings")
@Controller("settings")
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class SettingsController {
    constructor(private readonly settings: SettingsService) {}

    @Get("summary")
    @ApiOperation({ summary: "Counts shown on the Settings page" })
    @ApiResponse({ status: 200, description: "Live counts and connected app names" })
    @ApiResponse({ status: 401, description: "Not signed in" })
    getSummary(@CurrentUser() user: { id: string }): Promise<ISettingsSummary> {
        return this.settings.getSummary(user.id);
    }
}
