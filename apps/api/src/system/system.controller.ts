import { Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { UserRole } from "@prisma/client";
import type { IChangelogResponse, IChangelogSeenResponse, ISystemInfo, ISystemUpgradeResponse } from "@badger/types";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { AdminGuard } from "../auth/guards/admin.guard";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { SystemService } from "./system.service";
import { UpgradeService } from "./upgrade.service";

/**
 * Authenticated on purpose: the version is never exposed on public endpoints (/health stays unchanged) so a running
 * instance cannot be fingerprinted by anonymous clients.
 */
@ApiTags("system")
@Controller("system")
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class SystemController {
    constructor(
        private readonly system: SystemService,
        private readonly upgradeService: UpgradeService,
    ) {}

    @Get("info")
    @ApiOperation({ summary: "Running version, commit and the cached latest release" })
    @ApiResponse({ status: 200, description: "Version and update status" })
    @ApiResponse({ status: 401, description: "Not signed in" })
    getInfo(@CurrentUser() user: { id: string; role: UserRole }): Promise<ISystemInfo> {
        return this.system.getInfo(user);
    }

    @Post("check-updates")
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: "Check GitHub for a newer release now (server-wide cooldown of one minute)" })
    @ApiResponse({ status: 200, description: "Version and update status after the check" })
    @ApiResponse({ status: 401, description: "Not signed in" })
    checkForUpdates(@CurrentUser() user: { id: string; role: UserRole }): Promise<ISystemInfo> {
        return this.system.checkForUpdates(user);
    }

    @Post("upgrade")
    @HttpCode(HttpStatus.ACCEPTED)
    @UseGuards(AdminGuard)
    @ApiOperation({ summary: "Trigger the host's deploy webhook to upgrade this instance (admin only)" })
    @ApiResponse({ status: 202, description: "The host accepted the deploy request" })
    @ApiResponse({ status: 401, description: "Not signed in" })
    @ApiResponse({ status: 403, description: "Not the instance admin" })
    @ApiResponse({ status: 404, description: "In-app upgrade is not configured on this instance" })
    @ApiResponse({ status: 409, description: "An upgrade is already in progress" })
    @ApiResponse({ status: 502, description: "The host rejected the deploy request or could not be reached" })
    upgrade(@CurrentUser() user: { id: string }): Promise<ISystemUpgradeResponse> {
        return this.upgradeService.trigger(user.id);
    }

    @Get("changelog")
    @ApiOperation({ summary: "User-facing release notes up to the running build, with the user's last seen version" })
    @ApiResponse({ status: 200, description: "Releases, newest first" })
    @ApiResponse({ status: 401, description: "Not signed in" })
    getChangelog(@CurrentUser() user: { id: string }): Promise<IChangelogResponse> {
        return this.system.getChangelog(user.id);
    }

    @Post("changelog/seen")
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: "Record that the user has seen What's New for the running build" })
    @ApiResponse({ status: 200, description: "The stored last seen version" })
    @ApiResponse({ status: 401, description: "Not signed in" })
    markChangelogSeen(@CurrentUser() user: { id: string }): Promise<IChangelogSeenResponse> {
        return this.system.markChangelogSeen(user.id);
    }
}
