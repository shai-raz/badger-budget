import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { IPushSubscription } from "@badger/types";
import type { AuthUser } from "../auth/auth-user";
import { PrismaService } from "../prisma/prisma.service";
import type { RegisterPushSubscriptionDto } from "./dto/register-push-subscription.dto";

const PUSH_SUBSCRIPTION_VIEW = {
    id: true,
    endpoint: true,
    deviceLabel: true,
    createdAt: true,
    lastSeenAt: true,
    lastAcceptedAt: true,
} as const;

interface PushSubscriptionView {
    id: string;
    endpoint: string;
    deviceLabel: string;
    createdAt: Date;
    lastSeenAt: Date;
    lastAcceptedAt: Date | null;
}

/** Keys are write-only: they never leave the server. */
function toPushSubscription(row: PushSubscriptionView): IPushSubscription {
    return {
        id: row.id,
        endpoint: row.endpoint,
        deviceLabel: row.deviceLabel,
        createdAt: row.createdAt.toISOString(),
        lastSeenAt: row.lastSeenAt.toISOString(),
        lastAcceptedAt: row.lastAcceptedAt?.toISOString() ?? null,
    };
}

@Injectable()
export class PushSubscriptionsService {
    constructor(private readonly prisma: PrismaService) {}

    /** Registering an endpoint that another user holds moves it to the caller (one browser, one account). */
    async register(user: AuthUser, dto: RegisterPushSubscriptionDto): Promise<IPushSubscription> {
        if (user.isDemo) throw new ForbiddenException("The demo account can't turn on notifications");

        const row = await this.prisma.pushSubscription.upsert({
            where: { endpoint: dto.endpoint },
            create: {
                userId: user.id,
                endpoint: dto.endpoint,
                p256dh: dto.keys.p256dh,
                auth: dto.keys.auth,
                deviceLabel: dto.deviceLabel,
                lastSeenAt: new Date(),
            },
            update: {
                userId: user.id,
                p256dh: dto.keys.p256dh,
                auth: dto.keys.auth,
                deviceLabel: dto.deviceLabel,
                lastSeenAt: new Date(),
            },
            select: PUSH_SUBSCRIPTION_VIEW,
        });
        return toPushSubscription(row);
    }

    async list(userId: string): Promise<IPushSubscription[]> {
        const rows = await this.prisma.pushSubscription.findMany({
            where: { userId },
            orderBy: { createdAt: "asc" },
            select: PUSH_SUBSCRIPTION_VIEW,
        });
        return rows.map(toPushSubscription);
    }

    async remove(userId: string, id: string): Promise<void> {
        const { count } = await this.prisma.pushSubscription.deleteMany({ where: { id, userId } });
        if (count === 0) throw new NotFoundException("Push subscription not found");
    }

    /** Idempotent: an endpoint that is not registered for the caller is not an error. */
    async unregister(userId: string, endpoint: string): Promise<void> {
        await this.prisma.pushSubscription.deleteMany({ where: { userId, endpoint } });
    }
}
