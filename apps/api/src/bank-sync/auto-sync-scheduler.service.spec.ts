import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../prisma/prisma.service";
import { PushService } from "../notifications/push.service";
import { AutoSyncService } from "./auto-sync.service";
import { AUTO_SYNC_TICK_MS, AutoSyncSchedulerService } from "./auto-sync-scheduler.service";

// 11 Nov 2026 is in Israel UTC+2 winter time, so 07:30 local is 05:30Z.
const NOW = new Date("2026-11-11T05:31:00Z");

type GrantRow = {
    id: string;
    userId: string;
    pushSubscriptionId: string;
    intervalUnit: string;
    intervalCount: number;
    windowStartMinute: number | null;
    windowEndMinute: number | null;
    runAtMinute: number | null;
    timeZone: string;
    scheduledRunAt: Date;
};

const dailyGrant = (overrides: Partial<GrantRow> = {}): GrantRow => ({
    id: "grant-1",
    userId: "user-1",
    pushSubscriptionId: "sub-1",
    intervalUnit: "days",
    intervalCount: 1,
    windowStartMinute: null,
    windowEndMinute: null,
    runAtMinute: 450,
    timeZone: "Asia/Jerusalem",
    scheduledRunAt: new Date("2026-11-11T05:30:00Z"),
    ...overrides,
});

const hourlyGrant = (overrides: Partial<GrantRow> = {}): GrantRow =>
    dailyGrant({
        intervalUnit: "hours",
        intervalCount: 1,
        runAtMinute: null,
        windowStartMinute: 420,
        windowEndMinute: 1320,
        ...overrides,
    });

describe("AutoSyncSchedulerService", () => {
    let service: AutoSyncSchedulerService;
    let concurrency: string;

    const mockPrisma = {
        autoSyncGrant: { updateMany: jest.fn(), findMany: jest.fn(), deleteMany: jest.fn() },
        autoSyncCredential: { deleteMany: jest.fn() },
        pushSubscription: { findFirst: jest.fn() },
        syncJob: { count: jest.fn(), findFirst: jest.fn() },
    };
    const mockAutoSync = { issueRunToken: jest.fn() };
    const mockPush = { send: jest.fn() };
    const mockConfig = { get: jest.fn() };

    /** The due query gets `due`; the expiry-warning query gets `expiring`. */
    const givenGrants = (due: GrantRow[], expiring: unknown[] = []) => {
        mockPrisma.autoSyncGrant.findMany.mockImplementation(async ({ where }: { where: object }) =>
            "dueAt" in where ? due : expiring,
        );
    };

    /** The updateMany calls that move a grant to its next schedule. */
    const advanceCalls = () =>
        mockPrisma.autoSyncGrant.updateMany.mock.calls
            .filter(([args]) => "scheduledRunAt" in args.data)
            .map(([args]) => ({ id: args.where.id as string, ...args.data }));

    beforeEach(async () => {
        jest.clearAllMocks();
        concurrency = "3";
        mockConfig.get.mockImplementation((key: string, fallback: string) =>
            key === "BANK_SYNC_CONCURRENCY" ? concurrency : fallback,
        );
        mockPrisma.autoSyncGrant.updateMany.mockResolvedValue({ count: 1 });
        mockPrisma.autoSyncGrant.deleteMany.mockResolvedValue({ count: 1 });
        mockPrisma.autoSyncCredential.deleteMany.mockResolvedValue({ count: 1 });
        mockPrisma.syncJob.count.mockResolvedValue(0);
        mockPrisma.syncJob.findFirst.mockResolvedValue(null);
        mockAutoSync.issueRunToken.mockImplementation(async (grantId: string) => ({
            token: `token-${grantId}`,
            expiresAt: new Date(),
        }));
        mockPush.send.mockResolvedValue([{ subscriptionId: "sub-1", outcome: "accepted" }]);
        mockPrisma.pushSubscription.findFirst.mockResolvedValue({ id: "sub-1" });
        givenGrants([]);

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                AutoSyncSchedulerService,
                { provide: PrismaService, useValue: mockPrisma },
                { provide: ConfigService, useValue: mockConfig },
                { provide: AutoSyncService, useValue: mockAutoSync },
                { provide: PushService, useValue: mockPush },
            ],
        }).compile();

        service = module.get<AutoSyncSchedulerService>(AutoSyncSchedulerService);
        jest.spyOn(service["logger"], "error").mockImplementation(() => undefined);
    });

    describe("run pushes (AC12)", () => {
        it("sends one run push per due grant, to its device, with the run token", async () => {
            givenGrants([
                dailyGrant({ id: "grant-1", pushSubscriptionId: "sub-1" }),
                dailyGrant({ id: "grant-2", userId: "user-2", pushSubscriptionId: "sub-2" }),
            ]);

            await service.tick(NOW);

            expect(mockAutoSync.issueRunToken).toHaveBeenCalledTimes(2);
            expect(mockPush.send).toHaveBeenCalledTimes(2);
            expect(mockPush.send).toHaveBeenNthCalledWith(
                1,
                { subscriptionId: "sub-1" },
                {
                    type: "auto-sync.run",
                    title: "Syncing your accounts…",
                    body: "",
                    url: "/bank-connections",
                    data: { grantId: "grant-1", runToken: "token-grant-1" },
                },
                expect.objectContaining({ tag: "auto-sync", urgency: "high" }),
            );
            expect(mockPush.send.mock.calls[1][0]).toEqual({ subscriptionId: "sub-2" });
        });

        it("skips a grant whose user has a sync in flight, and advances it without a push", async () => {
            givenGrants([dailyGrant({ userId: "busy-user" })]);
            mockPrisma.syncJob.findFirst.mockResolvedValue({ id: "job-1" });

            await service.tick(NOW);

            expect(mockAutoSync.issueRunToken).not.toHaveBeenCalled();
            expect(mockPush.send).not.toHaveBeenCalled();
            expect(advanceCalls()).toHaveLength(1);
            expect(advanceCalls()[0].scheduledRunAt).toEqual(new Date("2026-11-12T05:30:00Z"));
        });

        it("stops at the concurrency cap and leaves the rest untouched for the next tick", async () => {
            concurrency = "3";
            mockPrisma.syncJob.count.mockResolvedValue(1); // one job running: cap is 2
            givenGrants([
                dailyGrant({ id: "grant-1", userId: "u1", pushSubscriptionId: "sub-1" }),
                dailyGrant({ id: "grant-2", userId: "u2", pushSubscriptionId: "sub-2" }),
                dailyGrant({ id: "grant-3", userId: "u3", pushSubscriptionId: "sub-3" }),
                dailyGrant({ id: "grant-4", userId: "u4", pushSubscriptionId: "sub-4" }),
            ]);

            await service.tick(NOW);

            expect(mockPush.send).toHaveBeenCalledTimes(2);
            expect(mockAutoSync.issueRunToken.mock.calls.map(([id]) => id)).toEqual(["grant-1", "grant-2"]);
            expect(advanceCalls().map((call) => call.id)).toEqual(["grant-1", "grant-2"]);
        });

        it("does not push at all when running jobs already fill the cap", async () => {
            mockPrisma.syncJob.count.mockResolvedValue(3);
            givenGrants([dailyGrant()]);

            await service.tick(NOW);

            expect(mockPush.send).not.toHaveBeenCalled();
            expect(advanceCalls()).toHaveLength(0);
        });

        it("advances a daily 07:30 grant to the next local day at 07:30, with dueAt within 20 minutes of it", async () => {
            givenGrants([dailyGrant()]);

            await service.tick(NOW);

            const [advance] = advanceCalls();
            expect(advance.scheduledRunAt).toEqual(new Date("2026-11-12T05:30:00Z"));
            const offset = advance.dueAt.getTime() - advance.scheduledRunAt.getTime();
            expect(Math.abs(offset)).toBeLessThanOrEqual(20 * 60_000);
        });

        it("advances a 4-hour 07:00-22:00 grant to the next slot", async () => {
            // Slots are 07:00, 11:00, 15:00 and 19:00 local (05:00Z, 09:00Z, ...). The grant ran at 07:00.
            givenGrants([
                hourlyGrant({
                    intervalCount: 4,
                    scheduledRunAt: new Date("2026-11-11T05:00:00Z"),
                }),
            ]);

            await service.tick(new Date("2026-11-11T05:01:00Z"));

            const [advance] = advanceCalls();
            expect(advance.scheduledRunAt).toEqual(new Date("2026-11-11T09:00:00Z"));
            const offset = advance.dueAt.getTime() - advance.scheduledRunAt.getTime();
            expect(Math.abs(offset)).toBeLessThanOrEqual(5 * 60_000);
        });

        it("skips a grant whose stored schedule does not parse, and logs it", async () => {
            givenGrants([dailyGrant({ intervalUnit: "weeks" })]);

            await service.tick(NOW);

            expect(mockPush.send).not.toHaveBeenCalled();
            expect(advanceCalls()).toHaveLength(0);
            expect(service["logger"].error).toHaveBeenCalledTimes(1);
        });

        it("queries due grants that have not expired, oldest due first", async () => {
            await service.tick(NOW);

            expect(mockPrisma.autoSyncGrant.findMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { dueAt: { lte: NOW }, expiresAt: { gt: NOW } },
                    orderBy: { dueAt: "asc" },
                }),
            );
        });
    });

    describe("run push ttl (AC20)", () => {
        it("gives an hourly grant a one-hour push ttl", async () => {
            givenGrants([hourlyGrant()]);

            await service.tick(NOW);

            expect(mockPush.send.mock.calls[0][2]).toEqual(expect.objectContaining({ ttl: 3600 }));
        });

        it("caps the ttl of an every-2-days grant at six hours", async () => {
            givenGrants([dailyGrant({ intervalCount: 2 })]);

            await service.tick(NOW);

            expect(mockPush.send.mock.calls[0][2]).toEqual(expect.objectContaining({ ttl: 21600 }));
        });
    });

    describe("device ownership", () => {
        it("deletes a grant whose push subscription was removed, without pushing", async () => {
            givenGrants([dailyGrant()]);
            mockPrisma.pushSubscription.findFirst.mockResolvedValueOnce(null);

            await service.tick(NOW);

            expect(mockAutoSync.issueRunToken).not.toHaveBeenCalled();
            expect(mockPush.send).not.toHaveBeenCalled();
            expect(mockPrisma.autoSyncGrant.deleteMany).toHaveBeenCalledWith({ where: { id: "grant-1" } });
            expect(advanceCalls()).toHaveLength(0);
        });

        it("deletes a grant whose subscription now belongs to another user, after checking the owner", async () => {
            givenGrants([dailyGrant()]);
            mockPrisma.pushSubscription.findFirst.mockResolvedValueOnce(null);

            await service.tick(NOW);

            expect(mockPrisma.pushSubscription.findFirst).toHaveBeenCalledWith({
                where: { id: "sub-1", userId: "user-1", removedAt: null },
                select: { id: true },
            });
            expect(mockPush.send).not.toHaveBeenCalled();
            expect(mockPrisma.autoSyncGrant.deleteMany).toHaveBeenCalledWith({ where: { id: "grant-1" } });
        });
    });

    describe("gone devices (AC13)", () => {
        it("deletes the grant and its credentials when its device subscription is gone", async () => {
            givenGrants([dailyGrant()]);
            mockPush.send.mockResolvedValue([{ subscriptionId: "sub-1", outcome: "gone", statusCode: 410 }]);

            await service.tick(NOW);

            expect(mockPrisma.autoSyncCredential.deleteMany).toHaveBeenCalledWith({ where: { grantId: "grant-1" } });
            expect(mockPrisma.autoSyncGrant.deleteMany).toHaveBeenCalledWith({ where: { id: "grant-1" } });
            expect(advanceCalls()).toHaveLength(0);
        });

        it("advances the schedule when a push merely failed", async () => {
            givenGrants([dailyGrant()]);
            mockPush.send.mockResolvedValue([{ subscriptionId: "sub-1", outcome: "failed", statusCode: 500 }]);

            await service.tick(NOW);

            expect(mockPrisma.autoSyncGrant.deleteMany).not.toHaveBeenCalled();
            expect(advanceCalls()).toHaveLength(1);
        });
    });

    describe("missed runs (AC24)", () => {
        it("counts an unused run token past its expiry as a missed run and clears it", async () => {
            await service.tick(NOW);

            expect(mockPrisma.autoSyncGrant.updateMany).toHaveBeenNthCalledWith(1, {
                where: { runTokenHash: { not: null }, runTokenExpiresAt: { lte: NOW } },
                data: { runTokenHash: null, runTokenExpiresAt: null, missedRuns: { increment: 1 } },
            });
        });
    });

    describe("expiry warning", () => {
        const expiringGrant = {
            id: "grant-exp",
            userId: "user-1",
            pushSubscriptionId: "sub-1",
            timeZone: "Asia/Jerusalem",
            expiresAt: new Date("2026-11-13T05:31:00Z"),
        };

        it("sends the warning to the grant's device, dated in the grant's time zone, then marks it warned", async () => {
            givenGrants([], [expiringGrant]);

            await service.tick(NOW);

            expect(mockPrisma.autoSyncGrant.findMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: {
                        expiryWarnedAt: null,
                        expiresAt: { gt: NOW, lte: new Date(NOW.getTime() + 3 * 24 * 3_600_000) },
                    },
                }),
            );
            expect(mockPush.send).toHaveBeenCalledWith(
                { subscriptionId: "sub-1" },
                {
                    type: "auto-sync.expiring",
                    title: "Auto-sync stops on Nov 13",
                    body: "Tap to keep it on.",
                    url: "/bank-connections",
                    data: { expiresAt: "2026-11-13T05:31:00.000Z" },
                },
            );
            expect(mockPrisma.autoSyncGrant.updateMany).toHaveBeenCalledWith({
                where: { id: "grant-exp", expiryWarnedAt: null },
                data: { expiryWarnedAt: NOW },
            });
        });

        it("sends the warning even if the user muted the old Auto-sync ending preference", async () => {
            givenGrants([], [expiringGrant]);

            await service.tick(NOW);

            expect(mockPush.send).toHaveBeenCalledWith(
                { subscriptionId: "sub-1" },
                expect.objectContaining({ type: "auto-sync.expiring" }),
            );
            expect(mockPrisma.autoSyncGrant.updateMany).toHaveBeenCalledWith({
                where: { id: "grant-exp", expiryWarnedAt: null },
                data: { expiryWarnedAt: NOW },
            });
        });

        it("keeps warning the other grants when one warning throws", async () => {
            givenGrants([], [expiringGrant, { ...expiringGrant, id: "grant-exp-2", pushSubscriptionId: "sub-2" }]);
            mockPush.send.mockRejectedValueOnce(new Error("push down"));

            await expect(service.tick(NOW)).resolves.toBeUndefined();

            expect(mockPush.send).toHaveBeenCalledTimes(2);
            expect(mockPush.send.mock.calls[1][0]).toEqual({ subscriptionId: "sub-2" });
        });
    });

    describe("interval", () => {
        it("is registered as a five-minute @nestjs/schedule interval", () => {
            // @nestjs/schedule keeps its interval options under this metadata key on the handler.
            expect(
                Reflect.getMetadata("SCHEDULE_INTERVAL_OPTIONS", AutoSyncSchedulerService.prototype.onInterval),
            ).toEqual({ timeout: AUTO_SYNC_TICK_MS });
            expect(AUTO_SYNC_TICK_MS).toBe(5 * 60_000);
        });

        it("skips an interval tick while the previous tick is still running", async () => {
            let release: () => void = () => undefined;
            const tickSpy = jest
                .spyOn(service, "tick")
                .mockImplementation(() => new Promise<void>((resolve) => (release = resolve)));

            const first = service.onInterval();
            await service.onInterval();
            expect(tickSpy).toHaveBeenCalledTimes(1);

            release();
            await first;
            tickSpy.mockResolvedValue(undefined);
            await service.onInterval();
            expect(tickSpy).toHaveBeenCalledTimes(2);
        });
    });

    describe("failure", () => {
        it("keeps going with the other grants when one run push throws", async () => {
            givenGrants([
                dailyGrant({ id: "grant-1", userId: "u1" }),
                dailyGrant({ id: "grant-2", userId: "u2", pushSubscriptionId: "sub-2" }),
            ]);
            mockPush.send.mockRejectedValueOnce(new Error("push down"));

            await service.tick(NOW);

            expect(mockPush.send).toHaveBeenCalledTimes(2);
            expect(advanceCalls().map((call) => call.id)).toEqual(["grant-2"]);
            expect(service["logger"].error).toHaveBeenCalledTimes(1);
        });

        it("never throws when the database rejects", async () => {
            mockPrisma.autoSyncGrant.updateMany.mockRejectedValue(new Error("db down"));
            mockPrisma.autoSyncGrant.findMany.mockRejectedValue(new Error("db down"));

            await expect(service.tick(NOW)).resolves.toBeUndefined();
            expect(service["logger"].error).toHaveBeenCalled();
        });
    });
});
