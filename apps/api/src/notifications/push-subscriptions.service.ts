import { ConflictException, ForbiddenException, GoneException, Injectable, NotFoundException } from "@nestjs/common";
import type { IPushSubscription } from "@badger/types";
import type { AuthUser } from "../auth/auth-user";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import type { RegisterPushSubscriptionDto } from "./dto/register-push-subscription.dto";
import { replacePushSubscription } from "./replace-push-subscription";

const REMOVED_ENDPOINT_MESSAGE = "This device was removed from notifications. Turn them on again on that device.";
const GONE_ENDPOINT_MESSAGE = "This browser's push endpoint no longer works. Subscribe again for a new one.";

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
     * re-register, only by a deliberate turn-on, which registers a new endpoint. An endpoint the push service reported
     * dead answers 409: the browser subscribes again and registers the new one.
     *
     * `replacesId` is the row this browser registered before. When it is the caller's, the new endpoint takes its
     * place (see replacePushSubscription), so a browser that replaced its subscription keeps its device and grant.
     * Removed, it answers 410 like a removed endpoint; another user's or unknown, it is ignored.
     */
    async register(user: AuthUser, dto: RegisterPushSubscriptionDto): Promise<IPushSubscription> {
        if (user.isDemo) throw new ForbiddenException("The demo account can't turn on notifications");

        const existing = await this.prisma.pushSubscription.findUnique({
            where: { endpoint: dto.endpoint },
            select: { id: true, userId: true, removedAt: true, goneAt: true },
        });
        if (existing?.removedAt) throw new GoneException(REMOVED_ENDPOINT_MESSAGE);
        if (existing?.goneAt) throw new ConflictException(GONE_ENDPOINT_MESSAGE);

        const previous =
            dto.replacesId && dto.replacesId !== existing?.id
                ? await this.prisma.pushSubscription.findUnique({
                      where: { id: dto.replacesId },
                      select: { id: true, userId: true, removedAt: true },
                  })
                : null;
        const replaced = previous?.userId === user.id ? previous : null;
        if (replaced?.removedAt) throw new GoneException(REMOVED_ENDPOINT_MESSAGE);

        const now = new Date();
        const row = await this.prisma.$transaction(async (tx) => {
            if (existing && existing.userId !== user.id) {
                // The grant belongs to the old owner, so it goes in the same write that moves the endpoint.
                await deleteGrantsOfSubscription(tx, existing.id);
                if (replaced)
                    await tx.pushSubscription.update({ where: { id: existing.id }, data: { userId: user.id } });
            }
            if (replaced) {
                const id = await replacePushSubscription(tx, {
                    userId: user.id,
                    previousId: replaced.id,
                    endpoint: dto.endpoint,
                    keys: dto.keys,
                    deviceLabel: dto.deviceLabel,
                    now,
                });
                return tx.pushSubscription.findUniqueOrThrow({ where: { id }, select: PUSH_SUBSCRIPTION_VIEW });
            }
            return tx.pushSubscription.upsert({
                where: { endpoint: dto.endpoint },
                create: {
                    userId: user.id,
                    endpoint: dto.endpoint,
                    p256dh: dto.keys.p256dh,
                    auth: dto.keys.auth,
                    deviceLabel: dto.deviceLabel,
                    lastSeenAt: now,
                },
                update: {
                    userId: user.id,
                    p256dh: dto.keys.p256dh,
                    auth: dto.keys.auth,
                    deviceLabel: dto.deviceLabel,
                    lastSeenAt: now,
                },
                select: PUSH_SUBSCRIPTION_VIEW,
            });
        });
        return toPushSubscription(row);
    }

    /** Gone rows are left out: they wait for their device to come back (see register). */
    async list(userId: string): Promise<IPushSubscription[]> {
        const rows = await this.prisma.pushSubscription.findMany({
            where: { userId, removedAt: null, goneAt: null },
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
