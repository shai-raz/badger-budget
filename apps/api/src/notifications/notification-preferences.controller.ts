import { Body, Controller, ForbiddenException, Get, Patch, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import type { INotificationPreference } from "@badger/types";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import type { AuthUser } from "../auth/auth-user";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { NotificationPreferencesService } from "./notification-preferences.service";
import { UpdateNotificationPreferencesDto } from "./dto/update-notification-preferences.dto";

@ApiTags("notifications")
@Controller("notifications/preferences")
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class NotificationPreferencesController {
    constructor(private readonly prefs: NotificationPreferencesService) {}

    @Get()
    @ApiOperation({ summary: "List the signed-in user's notification preferences" })
    @ApiResponse({ status: 200, description: "Listed notification types the user's role may receive" })
    @ApiResponse({ status: 401, description: "Not signed in" })
    list(@CurrentUser() user: AuthUser): Promise<INotificationPreference[]> {
        return this.prefs.list({ id: user.id, role: user.role });
    }

    @Patch()
    @ApiOperation({ summary: "Turn notification types on or off for the signed-in user" })
    @ApiResponse({ status: 200, description: "Preferences after the update" })
    @ApiResponse({ status: 400, description: "Unknown or unavailable type, or a mandatory type turned off" })
    @ApiResponse({ status: 401, description: "Not signed in" })
    @ApiResponse({ status: 403, description: "The demo account can't change notification settings" })
    async update(
        @Body() dto: UpdateNotificationPreferencesDto,
        @CurrentUser() user: AuthUser,
    ): Promise<INotificationPreference[]> {
        if (user.isDemo) throw new ForbiddenException("The demo account can't change notification settings");

        return this.prefs.update({ id: user.id, role: user.role }, dto.preferences);
    }
}
