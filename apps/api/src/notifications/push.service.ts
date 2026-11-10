import { Inject, Injectable, Logger } from "@nestjs/common";
import type { NotificationContent, PushUrgency } from "@badger/shared-data";
import { PrismaService } from "../prisma/prisma.service";
import { NotificationPreferencesService } from "./notification-preferences.service";
import { PUSH_SENDER } from "./notifications.tokens";
import { pushErrorStatus, type PushSendOptions, type PushSender } from "./push-sender";

export type PushTarget = { userId: string } | { subscriptionId: string };

export interface PushOverrides {
    /** Collapse key on the device; defaults to the notification type. Never sent as the push Topic header. */
    tag?: string;
    ttl?: number;
    urgency?: PushUrgency;
}

export type PushOutcome = "accepted" | "gone" | "failed";

export interface PushResult {
    subscriptionId: string;
    outcome: PushOutcome;
    statusCode?: number;
}

export const DEFAULT_PUSH_TTL_SECONDS = 24 * 60 * 60;

interface DeliverySubscription {
    id: string;
    endpoint: string;
    p256dh: string;
    auth: string;
}

const SUBSCRIPTION_SELECT = { id: true, endpoint: true, p256dh: true, auth: true } as const;

@Injectable()
export class PushService {
    private readonly logger = new Logger(PushService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly preferences: NotificationPreferencesService,
        @Inject(PUSH_SENDER) private readonly sender: PushSender,
    ) {}

    /**
     * Sends a notification to every subscription of a user (the user's preferences apply), or to one subscription
     * (preferences are not applied: used for device-specific system pushes such as auto-sync). Delivery never throws:
     * each subscription gets an outcome; unreachable or rejected ones are reported as "failed" or "gone".
     */
    async send(target: PushTarget, content: NotificationContent, overrides?: PushOverrides): Promise<PushResult[]> {
        const subscriptions = await this.resolveSubscriptions(target, content.type);
        if (subscriptions.length === 0) return [];

        const body = JSON.stringify({ ...content, tag: overrides?.tag ?? content.type });
        const options: PushSendOptions = {
            ttl: overrides?.ttl ?? DEFAULT_PUSH_TTL_SECONDS,
            urgency: overrides?.urgency ?? "normal",
        };

        const settled = await Promise.allSettled(subscriptions.map((sub) => this.deliver(sub, body, options)));
        return settled.map((result, index) => {
            if (result.status === "fulfilled") return result.value;
            this.logger.warn(`Push bookkeeping failed for subscription ${subscriptions[index].id}`);
            return { subscriptionId: subscriptions[index].id, outcome: "failed" };
        });
    }

    private async resolveSubscriptions(target: PushTarget, type: string): Promise<DeliverySubscription[]> {
        if ("subscriptionId" in target) {
            const sub = await this.prisma.pushSubscription.findUnique({
                where: { id: target.subscriptionId },
                select: SUBSCRIPTION_SELECT,
            });
            return sub ? [sub] : [];
        }

        const user = await this.prisma.user.findFirst({
            where: { id: target.userId, deletedAt: null },
            select: { id: true, role: true },
        });
        if (!user || !(await this.preferences.shouldSend(user, type))) return [];

        return this.prisma.pushSubscription.findMany({
            where: { userId: user.id },
            select: SUBSCRIPTION_SELECT,
        });
    }

    private async deliver(sub: DeliverySubscription, body: string, options: PushSendOptions): Promise<PushResult> {
        try {
            await this.sender({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, body, options);
        } catch (err) {
            return this.handleRejection(sub.id, pushErrorStatus(err));
        }

        await this.prisma.pushSubscription.update({
            where: { id: sub.id },
            data: { lastAcceptedAt: new Date() },
        });
        return { subscriptionId: sub.id, outcome: "accepted" };
    }

    /** Only 404/410 mean the subscription is dead. Other statuses (or no status) keep the row so a later send can retry. */
    private async handleRejection(subscriptionId: string, statusCode: number | undefined): Promise<PushResult> {
        if (statusCode === 404 || statusCode === 410) {
            await this.prisma.pushSubscription.deleteMany({ where: { id: subscriptionId } });
            this.logger.warn(`Push subscription ${subscriptionId} is gone (status ${statusCode}); removed`);
            return { subscriptionId, outcome: "gone", statusCode };
        }

        if (statusCode === 403) {
            this.logger.error(
                `Push subscription ${subscriptionId} rejected with status 403; the VAPID key probably changed since the device subscribed`,
            );
        } else {
            this.logger.warn(`Push subscription ${subscriptionId} failed (status ${statusCode ?? "none"})`);
        }
        return { subscriptionId, outcome: "failed", statusCode };
    }
}
