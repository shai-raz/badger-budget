import { Body, Controller, Get, HttpCode, Param, Post, Query, Res, UseFilters, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Throttle, ThrottlerGuard } from "@nestjs/throttler";
import type { Response } from "express";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { OAuthDecisionDto } from "./dto/oauth-decision.dto";
import { OAuthAuthorizationService } from "./oauth-authorization.service";
import { OAuthClientsService } from "./oauth-clients.service";
import { OAuthError } from "./oauth-error";
import { OAuthExceptionFilter } from "./oauth-exception.filter";
import { OAuthTokensService } from "./oauth-tokens.service";

const MINUTE_MS = 60_000;

/**
 * OAuth 2.1 authorization server endpoints. The public endpoints type body/query as Record<string, unknown>
 * so the global ValidationPipe skips them; the services parse with zod and throw OAuthError.
 */
@ApiTags("oauth")
@Controller("oauth")
@UseFilters(OAuthExceptionFilter)
@UseGuards(ThrottlerGuard)
export class OAuthController {
    constructor(
        private readonly clients: OAuthClientsService,
        private readonly authorization: OAuthAuthorizationService,
        private readonly tokens: OAuthTokensService,
    ) {}

    @Post("register")
    @Throttle({ default: { limit: 20, ttl: MINUTE_MS } })
    @HttpCode(201)
    register(@Body() body: Record<string, unknown>) {
        return this.clients.register(body);
    }

    @Get("authorize")
    @Throttle({ default: { limit: 30, ttl: MINUTE_MS } })
    async authorize(@Query() query: Record<string, unknown>, @Res() res: Response): Promise<void> {
        const { redirectUrl } = await this.authorization.startAuthorization(query);
        res.redirect(302, redirectUrl);
    }

    @Post("token")
    @Throttle({ default: { limit: 60, ttl: MINUTE_MS } })
    @HttpCode(200)
    async token(@Body() body: Record<string, unknown>, @Res({ passthrough: true }) res: Response) {
        res.set({ "Cache-Control": "no-store", Pragma: "no-cache" });
        const params = body ?? {};
        let result: Record<string, unknown>;
        switch (params.grant_type) {
            case "authorization_code":
                result = { ...(await this.tokens.exchangeCode(params)) };
                break;
            case "refresh_token":
                result = { ...(await this.tokens.refresh(params)) };
                break;
            default:
                throw new OAuthError(
                    "unsupported_grant_type",
                    "grant_type must be authorization_code or refresh_token",
                );
        }
        // Defence in depth: internal ids must never reach the client.
        delete result.refreshTokenId;
        return result;
    }

    @Post("revoke")
    @Throttle({ default: { limit: 60, ttl: MINUTE_MS } })
    @HttpCode(200)
    async revoke(@Body() body: Record<string, unknown>): Promise<void> {
        await this.tokens.revoke(body ?? {});
    }

    @Get("requests/:id")
    @UseGuards(JwtAuthGuard)
    @Throttle({ default: { limit: 30, ttl: MINUTE_MS } })
    getRequest(@Param("id") id: string, @CurrentUser() user: { id: string }) {
        return this.authorization.getConsentRequest(id, user.id);
    }

    @Post("requests/:id/decision")
    @HttpCode(200)
    @UseGuards(JwtAuthGuard)
    @Throttle({ default: { limit: 30, ttl: MINUTE_MS } })
    decide(@Param("id") id: string, @Body() dto: OAuthDecisionDto, @CurrentUser() user: { id: string }) {
        return this.authorization.decide(id, user.id, dto.approve);
    }
}
