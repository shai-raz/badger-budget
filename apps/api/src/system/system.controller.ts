import { Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import type { IChangelogResponse, IChangelogSeenResponse, ISystemInfo } from "@badger/types";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { SystemService } from "./system.service";

/**
 * Authenticated on purpose: the version is never exposed on public endpoints (/health stays unchanged) so a running
 * instance cannot be fingerprinted by anonymous clients.
 */
@ApiTags("system")
@Controller("system")
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class SystemController {
    constructor(private readonly system: SystemService) {}

    @Get("info")
    @ApiOperation({ summary: "Running version, commit and the cached latest release" })
    @ApiResponse({ status: 200, description: "Version and update status" })
    @ApiResponse({ status: 401, description: "Not signed in" })
    getInfo(): Promise<ISystemInfo> {
        return this.system.getInfo();
    }

    @Post("check-updates")
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: "Check GitHub for a newer release now (server-wide cooldown of one minute)" })
    @ApiResponse({ status: 200, description: "Version and update status after the check" })
    @ApiResponse({ status: 401, description: "Not signed in" })
    checkForUpdates(): Promise<ISystemInfo> {
        return this.system.checkForUpdates();
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
