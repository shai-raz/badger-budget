import type { Prisma } from "@prisma/client";
import { replacePushSubscription } from "./replace-push-subscription";

const NOW = new Date("2026-11-18T12:00:00.000Z");
const INPUT = {
    userId: "user-1",
    previousId: "sub-old",
    endpoint: "https://fcm.googleapis.com/fcm/send/new",
    keys: { p256dh: "p", auth: "a" },
    now: NOW,
};

describe("replacePushSubscription", () => {
    const tx = {
        pushSubscription: { findUnique: jest.fn(), update: jest.fn(), deleteMany: jest.fn() },
        autoSyncGrant: { updateMany: jest.fn() },
    };
    const replace = (input: Partial<typeof INPUT> & { deviceLabel?: string } = {}) =>
        replacePushSubscription(tx as unknown as Prisma.TransactionClient, { ...INPUT, ...input });

    beforeEach(() => jest.resetAllMocks());

    it("hands a new endpoint to the earlier row, clearing goneAt, so its grant stays put", async () => {
        tx.pushSubscription.findUnique.mockResolvedValue(null);

        await expect(replace()).resolves.toBe("sub-old");

        expect(tx.pushSubscription.update).toHaveBeenCalledWith({
            where: { id: "sub-old" },
            data: { endpoint: INPUT.endpoint, p256dh: "p", auth: "a", lastSeenAt: NOW, goneAt: null },
        });
        expect(tx.autoSyncGrant.updateMany).not.toHaveBeenCalled();
        expect(tx.pushSubscription.deleteMany).not.toHaveBeenCalled();
    });

    it("updates the label only when one is given", async () => {
        tx.pushSubscription.findUnique.mockResolvedValue(null);

        await replace({ deviceLabel: "Pixel" });

        expect(tx.pushSubscription.update.mock.calls[0][0].data.deviceLabel).toBe("Pixel");
    });

    it("moves the grant to a row that already holds the endpoint and deletes the earlier row", async () => {
        tx.pushSubscription.findUnique.mockResolvedValue({ id: "sub-new" });

        await expect(replace()).resolves.toBe("sub-new");

        expect(tx.pushSubscription.update).toHaveBeenCalledWith({
            where: { id: "sub-new" },
            data: { p256dh: "p", auth: "a", lastSeenAt: NOW, goneAt: null },
        });
        expect(tx.autoSyncGrant.updateMany).toHaveBeenCalledWith({
            where: { pushSubscriptionId: "sub-old" },
            data: { pushSubscriptionId: "sub-new" },
        });
        expect(tx.pushSubscription.deleteMany).toHaveBeenCalledWith({ where: { id: "sub-old", userId: "user-1" } });
        // The grant moves before its old row goes, or the cascade would take it.
        expect(tx.autoSyncGrant.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
            tx.pushSubscription.deleteMany.mock.invocationCallOrder[0],
        );
    });

    it("only refreshes keys when the endpoint is already the earlier row's", async () => {
        tx.pushSubscription.findUnique.mockResolvedValue({ id: "sub-old" });

        await expect(replace()).resolves.toBe("sub-old");

        expect(tx.autoSyncGrant.updateMany).not.toHaveBeenCalled();
        expect(tx.pushSubscription.deleteMany).not.toHaveBeenCalled();
    });
});
