import { Module } from "@nestjs/common";
import { ThrottlerModule } from "@nestjs/throttler";
import { NOTIFICATION_TYPE_REGISTRY } from "@badger/shared-data";
import { AuthModule } from "../auth/auth.module";
import { NotificationPreferencesService } from "./notification-preferences.service";
import { PushController } from "./push.controller";
import { PushService } from "./push.service";
import { PushSubscriptionsService } from "./push-subscriptions.service";
import { createWebPushSender } from "./push-sender";
import { NOTIFICATION_MANDATORY_RULES, NOTIFICATION_REGISTRY, PUSH_SENDER, VAPID_CONFIG } from "./notifications.tokens";
import { resolveVapidConfig } from "./vapid";

@Module({
    // The throttler is not global; PushThrottlerGuard resolves its storage from this import.
    imports: [AuthModule, ThrottlerModule.forRoot([{ ttl: 60000, limit: 10 }])],
    controllers: [PushController],
    providers: [
        // Throws at boot when VAPID_PRIVATE_KEY is invalid (main.ts resolves secrets into process.env first).
        { provide: VAPID_CONFIG, useFactory: () => resolveVapidConfig(process.env) },
        { provide: PUSH_SENDER, useFactory: createWebPushSender, inject: [VAPID_CONFIG] },
        { provide: NOTIFICATION_REGISTRY, useValue: NOTIFICATION_TYPE_REGISTRY },
        { provide: NOTIFICATION_MANDATORY_RULES, useValue: {} },
        NotificationPreferencesService,
        PushService,
        PushSubscriptionsService,
    ],
    exports: [PushService, NotificationPreferencesService],
})
export class NotificationsModule {}
