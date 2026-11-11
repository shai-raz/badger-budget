import {
    Body,
    Controller,
    Delete,
    ForbiddenException,
    Get,
    HttpCode,
    HttpStatus,
    Inject,
    Param,
    ParseUUIDPipe,
    Post,
    UseGuards,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import type { IPushSubscription, IPushTestResponse, IVapidPublicKeyResponse } from "@badger/types";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import type { AuthUser } from "../auth/auth-user";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { PushThrottlerGuard } from "./push-throttler.guard";
import { PushService } from "./push.service";
import { PushSubscriptionsService } from "./push-subscriptions.service";
import { RegisterPushSubscriptionDto } from "./dto/register-push-subscription.dto";
import { UnregisterPushSubscriptionDto } from "./dto/unregister-push-subscription.dto";
import { VAPID_CONFIG } from "./notifications.tokens";
import type { VapidConfig } from "./vapid";

@ApiTags("push")
@Controller("push")
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class PushController {
    constructor(
        private readonly subscriptions: PushSubscriptionsService,
        private readonly pushService: PushService,
        @Inject(VAPID_CONFIG) private readonly vapid: VapidConfig,
    ) {}

    @Get("vapid-public-key")
    @ApiOperation({ summary: "Public VAPID key the browser subscribes with" })
    @ApiResponse({ status: 200, description: "Base64url uncompressed P-256 public key" })
    @ApiResponse({ status: 401, description: "Not signed in" })
    getVapidPublicKey(): IVapidPublicKeyResponse {
        return { publicKey: this.vapid.publicKey };
    }

    @Post("subscriptions")
    @HttpCode(HttpStatus.CREATED)
    @ApiOperation({ summary: "Register this browser for push notifications" })
    @ApiResponse({ status: 201, description: "Subscription registered" })
    @ApiResponse({ status: 400, description: "Invalid subscription" })
    @ApiResponse({ status: 403, description: "The demo account can't turn on notifications" })
    register(@Body() dto: RegisterPushSubscriptionDto, @CurrentUser() user: AuthUser): Promise<IPushSubscription> {
        return this.subscriptions.register(user, dto);
    }

    @Get("subscriptions")
    @ApiOperation({ summary: "List the signed-in user's push subscriptions" })
    @ApiResponse({ status: 200, description: "Subscriptions, oldest first" })
    list(@CurrentUser() user: AuthUser): Promise<IPushSubscription[]> {
        return this.subscriptions.list(user.id);
    }

    @Delete("subscriptions/:id")
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiOperation({ summary: "Remove one of the signed-in user's push subscriptions" })
    @ApiResponse({ status: 204, description: "Subscription removed" })
    @ApiResponse({ status: 404, description: "Subscription not found" })
    async remove(@Param("id", ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser): Promise<void> {
        await this.subscriptions.remove(user.id, id);
    }

    @Post("subscriptions/unregister")
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiOperation({ summary: "Remove this browser's subscription by endpoint (no-op when unknown)" })
    @ApiResponse({ status: 204, description: "Subscription removed or was not registered" })
    async unregister(@Body() dto: UnregisterPushSubscriptionDto, @CurrentUser() user: AuthUser): Promise<void> {
        await this.subscriptions.unregister(user.id, dto.endpoint);
    }

    @Post("test")
    @HttpCode(HttpStatus.OK)
    @UseGuards(PushThrottlerGuard)
    @Throttle({ default: { limit: 3, ttl: 60_000 } })
    @ApiOperation({ summary: "Send a test notification to the signed-in user's devices" })
    @ApiResponse({ status: 200, description: "Number of subscriptions targeted and accepted by their push services" })
    @ApiResponse({ status: 403, description: "The demo account can't turn on notifications" })
    @ApiResponse({ status: 429, description: "Too many test notifications" })
    async sendTest(@CurrentUser() user: AuthUser): Promise<IPushTestResponse> {
        if (user.isDemo) throw new ForbiddenException("The demo account can't turn on notifications");

        const results = await this.pushService.send(
            { userId: user.id },
            {
                type: "system.test",
                title: "Test notification",
                body: "Push notifications work on this device",
                url: "/settings/notifications",
                data: {},
            },
        );
        return {
            sent: results.length,
            accepted: results.filter((result) => result.outcome === "accepted").length,
        };
    }
}
