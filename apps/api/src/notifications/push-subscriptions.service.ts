import { ForbiddenException, GoneException, Injectable, NotFoundException } from "@nestjs/common";
import type { IPushSubscription } from "@badger/types";
import type { AuthUser } from "../auth/auth-user";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import type { RegisterPushSubscriptionDto } from "./dto/register-push-subscription.dto";

const REMOVED_ENDPOINT_MESSAGE = "This device was removed from notifications. Turn them on again on that device.";

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

/** Deletes the auto-sync grants that push to a subscription, with their credential copies. */
async function deleteGrantsOfSubscription(tx: Prisma.TransactionClient, subscriptionId: string): Promise<void> {
    await tx.autoSyncCredential.deleteMany({ where: { grant: { pushSubscriptionId: subscriptionId } } });
    await tx.autoSyncGrant.deleteMany({ where: { pushSubscriptionId: subscriptionId } });
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

    /**
     * Registering an endpoint that another user holds moves it to the caller (one browser, one account).
     * An endpoint the user removed from their devices answers 410 instead: the browser must not be re-added by a quiet
     * re-register, only by a deliberate turn-on, which registers a new endpoint.
     */
    async register(user: AuthUser, dto: RegisterPushSubscriptionDto): Promise<IPushSubscription> {
        if (user.isDemo) throw new ForbiddenException("The demo account can't turn on notifications");

        const existing = await this.prisma.pushSubscription.findUnique({
            where: { endpoint: dto.endpoint },
            select: { id: true, userId: true, removedAt: true },
        });
        if (existing?.removedAt) throw new GoneException(REMOVED_ENDPOINT_MESSAGE);

        const row = await this.prisma.$transaction(async (tx) => {
            // The grant belongs to the old owner, so it goes in the same write that moves the endpoint.
            if (existing && existing.userId !== user.id) await deleteGrantsOfSubscription(tx, existing.id);
            return tx.pushSubscription.upsert({
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
        });
        return toPushSubscription(row);
    }

    async list(userId: string): Promise<IPushSubscription[]> {
        const rows = await this.prisma.pushSubscription.findMany({
            where: { userId, removedAt: null },
            orderBy: { createdAt: "asc" },
            select: PUSH_SUBSCRIPTION_VIEW,
        });
        return rows.map(toPushSubscription);
    }

    /**
     * Keeps the row as a mark, so the endpoint's quiet re-register is refused (see register). The device's auto-sync
     * grant is deleted in the same transaction, so auto-sync stops on this device at once.
     */
    async remove(userId: string, id: string): Promise<void> {
        await this.prisma.$transaction(async (tx) => {
            const { count } = await tx.pushSubscription.updateMany({
                where: { id, userId, removedAt: null },
                data: { removedAt: new Date() },
            });
            if (count === 0) throw new NotFoundException("Push subscription not found");
            await deleteGrantsOfSubscription(tx, id);
        });
    }

    /** Idempotent: an endpoint that is not registered for the caller is not an error. */
    async unregister(userId: string, endpoint: string): Promise<void> {
        await this.prisma.pushSubscription.deleteMany({ where: { userId, endpoint } });
    }
}
