import type { Prisma } from "@prisma/client";

export interface PushSubscriptionReplacement {
    userId: string;
    /** The device's earlier row, live or gone. The caller checked it is the user's and was not removed. */
    previousId: string;
    endpoint: string;
    keys: { p256dh: string; auth: string };
    /** Kept as stored when omitted. */
    deviceLabel?: string;
    now: Date;
}

/**
 * Puts a browser's new endpoint in place of its earlier subscription, so the device keeps its row and the auto-sync
 * grant on it. A new endpoint is taken over by the earlier row. An endpoint the user already registered keeps its
 * own row: the earlier row's grant moves to it and the earlier row is deleted. The caller has rejected an endpoint
 * that is removed, gone, or (where it must not move) another user's. Returns the id of the row holding the endpoint.
 */
export async function replacePushSubscription(
    tx: Prisma.TransactionClient,
    input: PushSubscriptionReplacement,
): Promise<string> {
    const data = {
        p256dh: input.keys.p256dh,
        auth: input.keys.auth,
        lastSeenAt: input.now,
        goneAt: null,
        ...(input.deviceLabel !== undefined ? { deviceLabel: input.deviceLabel } : {}),
    };

    const existing = await tx.pushSubscription.findUnique({
        where: { endpoint: input.endpoint },
        select: { id: true },
    });
    if (!existing) {
        await tx.pushSubscription.update({
            where: { id: input.previousId },
            data: { endpoint: input.endpoint, ...data },
        });
        return input.previousId;
    }

    await tx.pushSubscription.update({ where: { id: existing.id }, data });
    if (existing.id !== input.previousId) {
        await tx.autoSyncGrant.updateMany({
            where: { pushSubscriptionId: input.previousId },
            data: { pushSubscriptionId: existing.id },
        });
        await tx.pushSubscription.deleteMany({ where: { id: input.previousId, userId: input.userId } });
    }
    return existing.id;
}
