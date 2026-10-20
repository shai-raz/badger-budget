import { Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { OAuthConfigService } from "./oauth-config.service";
import { OAuthTokensService } from "./oauth-tokens.service";

/** Connected-apps management for the signed-in user (web app, JWT). */
@ApiTags("oauth")
@ApiBearerAuth()
@Controller("oauth")
@UseGuards(JwtAuthGuard)
export class OAuthConnectionsController {
    constructor(
        private readonly tokens: OAuthTokensService,
        private readonly config: OAuthConfigService,
    ) {}

    @Get("connections")
    list(@CurrentUser() user: { id: string }) {
        return this.tokens.listConnections(user.id);
    }

    @Delete("connections/:id")
    @HttpCode(204)
    async revoke(@Param("id", ParseUUIDPipe) id: string, @CurrentUser() user: { id: string }): Promise<void> {
        await this.tokens.revokeConnection(user.id, id);
    }

    @Get("mcp-config")
    mcpConfig() {
        return { mcpServerUrl: this.config.mcpResourceUrl };
    }
}
