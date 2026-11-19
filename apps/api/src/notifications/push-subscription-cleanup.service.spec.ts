import { Logger } from "@nestjs/common";
import { AUTO_SYNC_DURATIONS } from "@badger/shared-data";
import { PrismaService } from "../prisma/prisma.service";
import { GONE_SUBSCRIPTION_RETENTION_DAYS, PushSubscriptionCleanupService } from "./push-subscription-cleanup.service";

const NOW = new Date("2026-11-18T12:00:00.000Z");

describe("PushSubscriptionCleanupService", () => {
    const prisma = { pushSubscription: { deleteMany: jest.fn() } };
    const service = new PushSubscriptionCleanupService(prisma as unknown as PrismaService);

    beforeEach(() => jest.resetAllMocks());

    it("deletes only subscriptions gone for longer than the retention", async () => {
        await service.tick(NOW);

        expect(prisma.pushSubscription.deleteMany).toHaveBeenCalledWith({
            where: { goneAt: { lte: new Date(NOW.getTime() - GONE_SUBSCRIPTION_RETENTION_DAYS * 86_400_000) } },
        });
    });

    it("outlasts every auto-sync duration, so a grant on a gone device expires before its device is dropped", () => {
        expect(GONE_SUBSCRIPTION_RETENTION_DAYS).toBeGreaterThan(Math.max(...AUTO_SYNC_DURATIONS));
    });

    it("logs and swallows a failure", async () => {
        const error = jest.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
        prisma.pushSubscription.deleteMany.mockRejectedValue(new Error("db down"));

        await expect(service.tick(NOW)).resolves.toBeUndefined();
        expect(error).toHaveBeenCalled();
        error.mockRestore();
    });
});
