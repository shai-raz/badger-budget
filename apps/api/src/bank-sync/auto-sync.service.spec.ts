import { randomBytes } from "crypto";
import { validate } from "class-validator";
import { Test, TestingModule } from "@nestjs/testing";
import { BadRequestException, ConflictException, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AUTO_SYNC_JITTER_MS } from "./auto-sync-schedule";
import { AUTO_SYNC_UNREACHABLE_AFTER_MS, AutoSyncService } from "./auto-sync.service";
import { BankSyncService } from "./bank-sync.service";
import { EnableAutoSyncDto } from "./dto/enable-auto-sync.dto";
import { UpdateAutoSyncScheduleDto } from "./dto/update-auto-sync-schedule.dto";
import { PrismaService } from "../prisma/prisma.service";
import { CredentialCryptoService, GrantDecryptError } from "../crypto/credential-crypto.service";
import { sha256Hex } from "../oauth/oauth-crypto";
import type { CredentialSource, SyncJobSummary } from "./credential-source";
import { PushService } from "../notifications/push.service";
import type { ScraperConnection } from "@prisma/client";

const DAY = 86_400_000;
const PIN = "1234";
const PEPPER = "test-pepper-value";
const TZ = "Asia/Jerusalem";
const NOW = new Date("2026-11-11T10:00:00.000Z");
const USER_ID = "user-1";
const KEY = randomBytes(32).toString("base64url");
const GRANT_ID = "00000000-0000-4000-8000-000000000001";
const PUSH_ID = "00000000-0000-4000-8000-0000000000a1";

describe("AutoSyncService", () => {
    let service: AutoSyncService;
    let crypto: CredentialCryptoService;

    const mockPrisma = {
        scraperConnection: { findMany: jest.fn() },
        autoSyncGrant: {
            findFirst: jest.fn(),
            findUnique: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
            updateMany: jest.fn(),
            deleteMany: jest.fn(),
        },
        autoSyncCredential: { findMany: jest.fn(), createMany: jest.fn(), deleteMany: jest.fn() },
        pushSubscription: { findFirst: jest.fn() },
        user: { findFirst: jest.fn() },
        $transaction: jest.fn(),
    };

    const mockBankSync = { verifyUserPin: jest.fn(), startSyncJob: jest.fn() };
    const mockPush = { send: jest.fn() };

    const mockConfigService = {
        get: jest.fn((key: string) => (key === "CREDENTIAL_ENCRYPTION_PEPPER" ? PEPPER : undefined)),
    };

    const storedConnection = (id: string, displayName: string, pin = PIN) => {
        const blob = crypto.encrypt(JSON.stringify({ username: displayName }), pin);
        return {
            id,
            displayName,
            credentialsCt: blob.ciphertext,
            credentialsIv: blob.iv,
            credentialsAuthTag: blob.authTag,
            credentialsSalt: blob.salt,
        };
    };

    const grantRow = (overrides: Record<string, unknown> = {}) => ({
        id: GRANT_ID,
        deviceLabel: "Laptop",
        intervalUnit: "hours",
        intervalCount: 4,
        windowStartMinute: 420,
        windowEndMinute: 1320,
        runAtMinute: null,
        timeZone: TZ,
        durationDays: 30,
        expiresAt: new Date(NOW.getTime() + 30 * DAY),
        scheduledRunAt: new Date("2026-11-11T13:00:00.000Z"),
        lastRunAt: null,
        missedRuns: 0,
        createdAt: NOW,
        ...overrides,
    });

    const enableDto = (overrides: Partial<EnableAutoSyncDto> = {}): EnableAutoSyncDto =>
        Object.assign(
            new EnableAutoSyncDto(),
            {
                intervalUnit: "hours",
                intervalCount: 4,
                windowStartMinute: 420,
                windowEndMinute: 1320,
                timeZone: TZ,
                pin: PIN,
                key: KEY,
                deviceLabel: "Laptop",
                pushSubscriptionId: PUSH_ID,
            },
            overrides,
        );

    const updateDto = (overrides: Partial<UpdateAutoSyncScheduleDto> = {}): UpdateAutoSyncScheduleDto =>
        Object.assign(
            new UpdateAutoSyncScheduleDto(),
            {
                intervalUnit: "days",
                intervalCount: 2,
                runAtMinute: 540,
                timeZone: TZ,
            },
            overrides,
        );

    beforeEach(async () => {
        jest.resetAllMocks();
        mockConfigService.get.mockImplementation((key: string) =>
            key === "CREDENTIAL_ENCRYPTION_PEPPER" ? PEPPER : undefined,
        );
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                AutoSyncService,
                CredentialCryptoService,
                { provide: ConfigService, useValue: mockConfigService },
                { provide: PrismaService, useValue: mockPrisma },
                { provide: BankSyncService, useValue: mockBankSync },
                { provide: PushService, useValue: mockPush },
            ],
        }).compile();

        service = module.get(AutoSyncService);
        crypto = module.get(CredentialCryptoService);
        mockPush.send.mockResolvedValue([{ subscriptionId: PUSH_ID, outcome: "accepted" }]);
        mockPrisma.user.findFirst.mockResolvedValue({ id: USER_ID, role: "user" });

        mockBankSync.verifyUserPin.mockImplementation(async (_userId: string, pin: string) => {
            if (pin !== PIN) throw new UnauthorizedException("Invalid PIN");
        });
        mockPrisma.$transaction.mockImplementation((cb: (tx: typeof mockPrisma) => unknown) => cb(mockPrisma));
        mockPrisma.autoSyncGrant.create.mockImplementation(async ({ data }) =>
            grantRow({
                id: data.id,
                deviceLabel: data.deviceLabel,
                intervalUnit: data.intervalUnit,
                intervalCount: data.intervalCount,
                windowStartMinute: data.windowStartMinute,
                windowEndMinute: data.windowEndMinute,
                runAtMinute: data.runAtMinute,
                timeZone: data.timeZone,
                durationDays: data.durationDays,
                expiresAt: data.expiresAt,
                scheduledRunAt: data.scheduledRunAt,
            }),
        );
        mockPrisma.autoSyncCredential.findMany.mockResolvedValue([]);
        mockPrisma.scraperConnection.findMany.mockResolvedValue([]);
        mockPrisma.pushSubscription.findFirst.mockResolvedValue({ id: PUSH_ID });
    });

    afterEach(() => {
        jest.resetAllMocks();
    });

    const expectNoWrites = () => {
        expect(mockPrisma.$transaction).not.toHaveBeenCalled();
        expect(mockPrisma.autoSyncGrant.create).not.toHaveBeenCalled();
        expect(mockPrisma.autoSyncGrant.update).not.toHaveBeenCalled();
        expect(mockPrisma.autoSyncGrant.deleteMany).not.toHaveBeenCalled();
        expect(mockPrisma.autoSyncCredential.createMany).not.toHaveBeenCalled();
    };

    describe("enable", () => {
        it("rejects a wrong PIN with 401 and writes nothing (AC4)", async () => {
            mockPrisma.scraperConnection.findMany.mockResolvedValueOnce([storedConnection("c1", "Bank A")]);

            await expect(service.enable(USER_ID, enableDto({ pin: "9999" }), NOW)).rejects.toThrow(
                UnauthorizedException,
            );
            expectNoWrites();
        });

        it("rejects a push subscription that is missing, removed or not the user's, before any other work", async () => {
            mockPrisma.pushSubscription.findFirst.mockResolvedValueOnce(null);

            await expect(service.enable(USER_ID, enableDto(), NOW)).rejects.toThrow(
                new BadRequestException("Unknown push subscription"),
            );
            expect(mockPrisma.pushSubscription.findFirst).toHaveBeenCalledWith({
                where: { id: PUSH_ID, userId: USER_ID, removedAt: null },
                select: { id: true },
            });
            expect(mockBankSync.verifyUserPin).not.toHaveBeenCalled();
            expectNoWrites();
        });

        it("stores the push subscription the grant is linked to", async () => {
            mockPrisma.scraperConnection.findMany
                .mockResolvedValueOnce([storedConnection("c1", "Bank A")])
                .mockResolvedValueOnce([{ id: "c1", displayName: "Bank A" }]);
            mockPrisma.autoSyncCredential.findMany.mockResolvedValueOnce([{ connectionId: "c1" }]);

            await service.enable(USER_ID, enableDto(), NOW);

            expect(mockPrisma.autoSyncGrant.create.mock.calls[0][0].data).toMatchObject({
                pushSubscriptionId: PUSH_ID,
            });
        });

        it("replaces the old grant and stores one credential copy per active connection", async () => {
            mockPrisma.scraperConnection.findMany
                .mockResolvedValueOnce([storedConnection("c1", "Bank A"), storedConnection("c2", "Card B")])
                .mockResolvedValueOnce([
                    { id: "c1", displayName: "Bank A" },
                    { id: "c2", displayName: "Card B" },
                ]);
            mockPrisma.autoSyncCredential.findMany.mockResolvedValueOnce([
                { connectionId: "c1" },
                { connectionId: "c2" },
            ]);

            await service.enable(USER_ID, enableDto(), NOW);

            expect(mockPrisma.autoSyncCredential.deleteMany).toHaveBeenCalledWith({
                where: { grant: { userId: USER_ID } },
            });
            expect(mockPrisma.autoSyncGrant.deleteMany).toHaveBeenCalledWith({ where: { userId: USER_ID } });
            expect(mockPrisma.autoSyncGrant.create).toHaveBeenCalledTimes(1);

            const grantData = mockPrisma.autoSyncGrant.create.mock.calls[0][0].data;
            const grantId = grantData.id;
            expect(grantData).toMatchObject({
                userId: USER_ID,
                pushSubscriptionId: PUSH_ID,
                intervalUnit: "hours",
                intervalCount: 4,
                windowStartMinute: 420,
                windowEndMinute: 1320,
                runAtMinute: null,
                timeZone: TZ,
                durationDays: 30,
            });

            const rows = mockPrisma.autoSyncCredential.createMany.mock.calls[0][0].data;
            expect(rows.map((row: { connectionId: string }) => row.connectionId)).toEqual(["c1", "c2"]);
            expect(rows.every((row: { grantId: string }) => row.grantId === grantId)).toBe(true);

            // Each copy decrypts with the device key alone; the PIN is not involved.
            const grantKey = crypto.deriveGrantKey(Buffer.from(KEY, "base64url"), grantId);
            const plaintexts = rows.map(
                (row: { connectionId: string; ciphertext: string; iv: string; authTag: string }) =>
                    crypto.decryptForGrant(
                        { ciphertext: row.ciphertext, iv: row.iv, authTag: row.authTag },
                        grantKey,
                        grantId,
                        row.connectionId,
                    ),
            );
            expect(plaintexts.map((text: string) => JSON.parse(text))).toEqual([
                { username: "Bank A" },
                { username: "Card B" },
            ]);
            expect(
                crypto.verifyGrantKeyCheck(
                    { ciphertext: grantData.keyCheckCt, iv: grantData.keyCheckIv, authTag: grantData.keyCheckAuthTag },
                    grantKey,
                    grantId,
                ),
            ).toBe(true);
        });

        it("schedules the first run from now and jitters the due time within bounds", async () => {
            mockPrisma.scraperConnection.findMany.mockResolvedValueOnce([storedConnection("c1", "Bank A")]);

            await service.enable(USER_ID, enableDto(), NOW);

            const grantData = mockPrisma.autoSyncGrant.create.mock.calls[0][0].data;
            // Hourly grid 07:00, 11:00, 15:00, 19:00 in Jerusalem; it is 12:00 there, so the next run is 15:00.
            expect(grantData.scheduledRunAt.toISOString()).toBe("2026-11-11T13:00:00.000Z");
            expect(Math.abs(grantData.dueAt.getTime() - grantData.scheduledRunAt.getTime())).toBeLessThanOrEqual(
                AUTO_SYNC_JITTER_MS.hours,
            );
        });

        it("defaults the duration to 30 days and sets the expiry from now", async () => {
            mockPrisma.scraperConnection.findMany.mockResolvedValueOnce([storedConnection("c1", "Bank A")]);

            await service.enable(USER_ID, enableDto(), NOW);

            const grantData = mockPrisma.autoSyncGrant.create.mock.calls[0][0].data;
            expect(grantData.durationDays).toBe(30);
            expect(grantData.expiresAt.getTime()).toBe(NOW.getTime() + 30 * DAY);
        });

        it("stores the canonical time zone id when the zone is sent in another case", async () => {
            mockPrisma.scraperConnection.findMany.mockResolvedValueOnce([storedConnection("c1", "Bank A")]);

            await service.enable(USER_ID, enableDto({ timeZone: "asia/jerusalem" }), NOW);

            expect(mockPrisma.autoSyncGrant.create.mock.calls[0][0].data.timeZone).toBe(TZ);
        });

        it("returns the status with the connections split", async () => {
            mockPrisma.scraperConnection.findMany
                .mockResolvedValueOnce([storedConnection("c1", "Bank A")])
                .mockResolvedValueOnce([{ id: "c1", displayName: "Bank A" }]);
            mockPrisma.autoSyncCredential.findMany.mockResolvedValueOnce([{ connectionId: "c1" }]);

            const status = await service.enable(USER_ID, enableDto(), NOW);

            expect(status).toMatchObject({
                intervalUnit: "hours",
                durationDays: 30,
                nextRunAt: "2026-11-11T13:00:00.000Z",
                includedConnections: [{ id: "c1", displayName: "Bank A" }],
                notIncludedConnections: [],
            });
        });

        it("rejects zero active connections and writes nothing", async () => {
            mockPrisma.scraperConnection.findMany.mockResolvedValueOnce([]);

            await expect(service.enable(USER_ID, enableDto(), NOW)).rejects.toThrow(
                new BadRequestException("No active scraper connections"),
            );
            expectNoWrites();
        });

        it("rejects an undecryptable connection by name and stores nothing", async () => {
            mockPrisma.scraperConnection.findMany.mockResolvedValueOnce([
                storedConnection("c1", "Bank A"),
                storedConnection("c2", "Card B", "9999"),
            ]);

            await expect(service.enable(USER_ID, enableDto(), NOW)).rejects.toThrow(/Card B/);
            expectNoWrites();
        });

        it("rejects an unknown time zone and writes nothing", async () => {
            await expect(service.enable(USER_ID, enableDto({ timeZone: "Mars/Olympus" }), NOW)).rejects.toThrow(
                new BadRequestException("Unknown time zone"),
            );
            expectNoWrites();
        });
    });

    describe("schedule and duration rules", () => {
        it("rejects a duration shorter than two intervals on enable (AC23)", async () => {
            const fiveDayInterval = enableDto({
                intervalUnit: "days",
                intervalCount: 5,
                windowStartMinute: null,
                windowEndMinute: null,
                runAtMinute: 540,
                durationDays: 7,
            });

            await expect(service.enable(USER_ID, fiveDayInterval, NOW)).rejects.toThrow(
                new BadRequestException("Keep auto-sync on for at least two intervals"),
            );
            expectNoWrites();
        });

        it("rejects a duration shorter than two intervals on reschedule (AC23)", async () => {
            mockPrisma.autoSyncGrant.findFirst.mockResolvedValueOnce(grantRow({ durationDays: 7 }));

            await expect(service.updateSchedule(USER_ID, updateDto({ intervalCount: 5 }), NOW)).rejects.toThrow(
                new BadRequestException("Keep auto-sync on for at least two intervals"),
            );
            expect(mockPrisma.autoSyncGrant.update).not.toHaveBeenCalled();
        });

        it.each([
            [
                "hours without a window",
                { windowStartMinute: null, windowEndMinute: null },
                "Hourly sync needs a start and end time.",
            ],
            ["hours with a run time", { runAtMinute: 540 }, "Hourly sync does not take a run time."],
            [
                "days without a run time",
                {
                    intervalUnit: "days",
                    intervalCount: 1,
                    windowStartMinute: null,
                    windowEndMinute: null,
                    runAtMinute: null,
                },
                "Daily sync needs a run time from 0 to 1439.",
            ],
            [
                "days with a window",
                {
                    intervalUnit: "days",
                    intervalCount: 1,
                    runAtMinute: 540,
                    windowStartMinute: 420,
                    windowEndMinute: 1320,
                },
                "Daily sync does not take a window.",
            ],
            ["hours above 23", { intervalCount: 24 }, "Up to 23 hours. For more, use days."],
            [
                "days above 7",
                {
                    intervalUnit: "days",
                    intervalCount: 8,
                    windowStartMinute: null,
                    windowEndMinute: null,
                    runAtMinute: 540,
                },
                "Up to 7 days.",
            ],
        ])(
            "rejects an invalid schedule for %s with its message on enable (AC18)",
            async (_label, overrides, message) => {
                await expect(
                    service.enable(USER_ID, enableDto(overrides as Partial<EnableAutoSyncDto>), NOW),
                ).rejects.toThrow(new BadRequestException(message));
                expectNoWrites();
            },
        );

        it("rejects an invalid schedule on reschedule with its message (AC18)", async () => {
            mockPrisma.autoSyncGrant.findFirst.mockResolvedValueOnce(grantRow());

            await expect(service.updateSchedule(USER_ID, updateDto({ intervalCount: 8 }), NOW)).rejects.toThrow(
                new BadRequestException("Up to 7 days."),
            );
            expect(mockPrisma.autoSyncGrant.update).not.toHaveBeenCalled();
        });
    });

    describe("getStatus", () => {
        it("returns null when there is no live grant", async () => {
            mockPrisma.autoSyncGrant.findFirst.mockResolvedValueOnce(null);

            await expect(service.getStatus(USER_ID, NOW)).resolves.toBeNull();
            expect(mockPrisma.autoSyncGrant.findFirst).toHaveBeenCalledWith(
                expect.objectContaining({ where: { userId: USER_ID, expiresAt: { gt: NOW } } }),
            );
        });

        it("splits the connections into covered and not covered (AC10)", async () => {
            mockPrisma.autoSyncGrant.findFirst.mockResolvedValueOnce(grantRow());
            mockPrisma.autoSyncCredential.findMany.mockResolvedValueOnce([{ connectionId: "c1" }]);
            mockPrisma.scraperConnection.findMany.mockResolvedValueOnce([
                { id: "c1", displayName: "Bank A" },
                { id: "c2", displayName: "Card B" },
            ]);

            const status = await service.getStatus(USER_ID, NOW);

            expect(status.includedConnections).toEqual([{ id: "c1", displayName: "Bank A" }]);
            expect(status.notIncludedConnections).toEqual([{ id: "c2", displayName: "Card B" }]);
            expect(status.nextRunAt).toBe("2026-11-11T13:00:00.000Z");
        });

        it.each([
            ["two misses and 25 hours since the last run", 2, 25, true],
            ["two misses but only 23 hours since the last run", 2, 23, false],
            ["one miss after 48 hours", 1, 48, false],
        ])("reports unreachable only for %s (AC24)", async (_label, missedRuns, hoursSinceRun, expected) => {
            mockPrisma.autoSyncGrant.findFirst.mockResolvedValueOnce(
                grantRow({
                    missedRuns,
                    lastRunAt: new Date(NOW.getTime() - hoursSinceRun * 3_600_000),
                }),
            );

            const status = await service.getStatus(USER_ID, NOW);

            expect(status.unreachable).toBe(expected);
        });

        it("measures unreachable from creation when no run has happened yet", async () => {
            mockPrisma.autoSyncGrant.findFirst.mockResolvedValueOnce(
                grantRow({ missedRuns: 2, lastRunAt: null, createdAt: new Date(NOW.getTime() - 25 * 3_600_000) }),
            );

            const status = await service.getStatus(USER_ID, NOW);

            expect(status.unreachable).toBe(true);
            expect(AUTO_SYNC_UNREACHABLE_AFTER_MS).toBe(24 * 3_600_000);
        });
    });

    describe("updateSchedule", () => {
        it("throws not found when there is no live grant", async () => {
            mockPrisma.autoSyncGrant.findFirst.mockResolvedValueOnce(null);

            await expect(service.updateSchedule(USER_ID, updateDto(), NOW)).rejects.toThrow(NotFoundException);
            expect(mockPrisma.autoSyncGrant.update).not.toHaveBeenCalled();
        });

        it("recomputes the next run and nulls the other unit's fields", async () => {
            mockPrisma.autoSyncGrant.findFirst.mockResolvedValueOnce(grantRow());
            mockPrisma.autoSyncGrant.update.mockImplementationOnce(async ({ data }) =>
                grantRow({
                    intervalUnit: data.intervalUnit,
                    intervalCount: data.intervalCount,
                    windowStartMinute: data.windowStartMinute,
                    windowEndMinute: data.windowEndMinute,
                    runAtMinute: data.runAtMinute,
                    scheduledRunAt: data.scheduledRunAt,
                }),
            );

            await service.updateSchedule(USER_ID, updateDto(), NOW);

            const data = mockPrisma.autoSyncGrant.update.mock.calls[0][0].data;
            expect(data).toMatchObject({
                intervalUnit: "days",
                intervalCount: 2,
                windowStartMinute: null,
                windowEndMinute: null,
                runAtMinute: 540,
                timeZone: TZ,
            });
            // 09:00 in Jerusalem has passed by 12:00 on the 11th, so the first run is 09:00 on the 12th.
            expect(data.scheduledRunAt.toISOString()).toBe("2026-11-12T07:00:00.000Z");
        });

        it("stores the canonical time zone id when the zone is sent in another case", async () => {
            mockPrisma.autoSyncGrant.findFirst.mockResolvedValueOnce(grantRow());
            mockPrisma.autoSyncGrant.update.mockResolvedValueOnce(grantRow());

            await service.updateSchedule(USER_ID, updateDto({ timeZone: "ASIA/JERUSALEM" }), NOW);

            expect(mockPrisma.autoSyncGrant.update.mock.calls[0][0].data.timeZone).toBe(TZ);
        });

        it("changes only the schedule: no PIN check, no expiry, duration or credential change", async () => {
            mockPrisma.autoSyncGrant.findFirst.mockResolvedValueOnce(grantRow());
            mockPrisma.autoSyncGrant.update.mockResolvedValueOnce(grantRow());

            await service.updateSchedule(USER_ID, updateDto(), NOW);

            expect(mockBankSync.verifyUserPin).not.toHaveBeenCalled();
            const data = mockPrisma.autoSyncGrant.update.mock.calls[0][0].data;
            expect(data).not.toHaveProperty("expiresAt");
            expect(data).not.toHaveProperty("durationDays");
            expect(mockPrisma.autoSyncCredential.createMany).not.toHaveBeenCalled();
            expect(mockPrisma.autoSyncCredential.deleteMany).not.toHaveBeenCalled();
        });
    });

    describe("disable", () => {
        it("deletes the credential copies and the grant", async () => {
            await service.disable(USER_ID);

            expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
            expect(mockPrisma.autoSyncCredential.deleteMany).toHaveBeenCalledWith({
                where: { grant: { userId: USER_ID } },
            });
            expect(mockPrisma.autoSyncGrant.deleteMany).toHaveBeenCalledWith({ where: { userId: USER_ID } });
        });

        it("succeeds when there is nothing to delete", async () => {
            mockPrisma.autoSyncCredential.deleteMany.mockResolvedValueOnce({ count: 0 });
            mockPrisma.autoSyncGrant.deleteMany.mockResolvedValueOnce({ count: 0 });

            await expect(service.disable(USER_ID)).resolves.toBeUndefined();
        });
    });
    describe("issueRunToken and run", () => {
        const TOKEN_LATER = new Date(NOW.getTime() + 2 * 3_600_000);
        const wrongKey = randomBytes(32).toString("base64url");

        type StoredRunState = {
            runTokenHash: string | null;
            runTokenExpiresAt: Date | null;
            expiresAt: Date;
            lastRunAt: Date | null;
            missedRuns: number;
        };
        let stored: StoredRunState;
        let keyCheck: { keyCheckCt: string; keyCheckIv: string; keyCheckAuthTag: string };

        const grantKey = () => crypto.deriveGrantKey(Buffer.from(KEY, "base64url"), GRANT_ID);

        const credentialRow = (connectionId: string, plaintext: string) => ({
            grantId: GRANT_ID,
            connectionId,
            ...crypto.encryptForGrant(plaintext, grantKey(), GRANT_ID, connectionId),
            connection: { id: connectionId, displayName: `Bank ${connectionId}`, isActive: true, deletedAt: null },
        });

        /** Issues a token and returns it; the stored grant state moves as the database would move it. */
        const issue = async (at: Date = NOW) => (await service.issueRunToken(GRANT_ID, at)).token;

        beforeEach(() => {
            stored = {
                runTokenHash: null,
                runTokenExpiresAt: null,
                expiresAt: new Date(NOW.getTime() + 30 * DAY),
                lastRunAt: null,
                missedRuns: 0,
            };
            const check = crypto.createGrantKeyCheck(grantKey(), GRANT_ID);
            keyCheck = { keyCheckCt: check.ciphertext, keyCheckIv: check.iv, keyCheckAuthTag: check.authTag };

            mockPrisma.autoSyncGrant.findUnique.mockImplementation(async ({ where }) =>
                where.id === GRANT_ID
                    ? {
                          id: GRANT_ID,
                          userId: USER_ID,
                          intervalUnit: "hours",
                          intervalCount: 1,
                          expiresAt: stored.expiresAt,
                          pushSubscriptionId: PUSH_ID,
                          runTokenHash: stored.runTokenHash,
                          ...keyCheck,
                      }
                    : null,
            );
            mockPrisma.autoSyncGrant.update.mockImplementation(async ({ data }) => {
                const { missedRuns, ...rest } = data;
                Object.assign(stored, rest);
                if (missedRuns) stored.missedRuns += missedRuns.increment;
                return {};
            });
            mockPrisma.autoSyncGrant.updateMany.mockImplementation(async ({ where, data }) => {
                const live =
                    stored.runTokenHash === where.runTokenHash &&
                    stored.runTokenExpiresAt !== null &&
                    stored.runTokenExpiresAt > where.runTokenExpiresAt.gt &&
                    stored.expiresAt > where.expiresAt.gt;
                if (!live) return { count: 0 };
                Object.assign(stored, data);
                return { count: 1 };
            });
            mockPrisma.autoSyncCredential.findMany.mockResolvedValue([
                credentialRow("c1", JSON.stringify({ username: "a" })),
                credentialRow("c2", JSON.stringify({ username: "b" })),
            ]);
            mockBankSync.startSyncJob.mockResolvedValue({ jobId: "job-1" });
        });

        describe("issueRunToken", () => {
            it.each([
                ["every hour", "hours", 1, 3_600_000],
                ["every 12 hours", "hours", 12, 6 * 3_600_000],
                ["every 3 days", "days", 3, 6 * 3_600_000],
            ])(
                "expires a run token after the interval, capped at six hours: %s (AC20)",
                async (_label, unit, count, ttl) => {
                    mockPrisma.autoSyncGrant.findUnique.mockResolvedValueOnce({
                        intervalUnit: unit,
                        intervalCount: count,
                        runTokenHash: null,
                        expiresAt: stored.expiresAt,
                    });

                    const { expiresAt } = await service.issueRunToken(GRANT_ID, NOW);

                    expect(expiresAt.getTime()).toBe(NOW.getTime() + ttl);
                },
            );

            it("stores only the hash of the token it returns", async () => {
                const token = await issue();

                expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
                expect(stored.runTokenHash).toBe(sha256Hex(token));
                expect(stored.runTokenExpiresAt?.getTime()).toBe(NOW.getTime() + 3_600_000);
            });

            it("counts a replaced unused token as a missed run, and the first token as no miss", async () => {
                await issue();
                expect(stored.missedRuns).toBe(0);

                await issue();
                expect(stored.missedRuns).toBe(1);
            });

            it("refuses to issue for a grant that is not on", async () => {
                mockPrisma.autoSyncGrant.findUnique.mockResolvedValueOnce(null);

                await expect(service.issueRunToken(GRANT_ID, NOW)).rejects.toThrow(NotFoundException);
                expect(mockPrisma.autoSyncGrant.update).not.toHaveBeenCalled();
            });
        });

        describe("run", () => {
            it("starts a job and consumes the token, so a second call is refused (AC6)", async () => {
                const token = await issue();

                await expect(service.run({ grantId: GRANT_ID, key: KEY, runToken: token }, NOW)).resolves.toEqual({
                    jobId: "job-1",
                });
                expect(mockBankSync.startSyncJob).toHaveBeenCalledTimes(1);
                expect(stored.runTokenHash).toBeNull();

                await expect(service.run({ grantId: GRANT_ID, key: KEY, runToken: token }, NOW)).rejects.toThrow(
                    new UnauthorizedException("Auto-sync run rejected"),
                );
                expect(mockBankSync.startSyncJob).toHaveBeenCalledTimes(1);
            });

            it("resets missedRuns and sets lastRunAt when the token is consumed", async () => {
                const token = await issue();
                stored.missedRuns = 3;

                await service.run({ grantId: GRANT_ID, key: KEY, runToken: token }, NOW);

                expect(stored.missedRuns).toBe(0);
                expect(stored.lastRunAt?.getTime()).toBe(NOW.getTime());
            });

            it.each([
                ["a wrong token", (token: string) => `${token}x`, NOW, KEY],
                ["an expired token", (token: string) => token, TOKEN_LATER, KEY],
                ["a wrong device key", (token: string) => token, NOW, wrongKey],
                ["a device key of the wrong length", (token: string) => token, NOW, "c2hvcnQ"],
            ])("refuses %s with the same 401 and starts no job", async (_label, pickToken, at, key) => {
                const token = await issue();

                await expect(service.run({ grantId: GRANT_ID, key, runToken: pickToken(token) }, at)).rejects.toThrow(
                    new UnauthorizedException("Auto-sync run rejected"),
                );
                expect(mockBankSync.startSyncJob).not.toHaveBeenCalled();
            });

            it("refuses an expired grant with the same 401", async () => {
                const token = await issue();
                stored.expiresAt = new Date(NOW.getTime() - 1000);

                await expect(service.run({ grantId: GRANT_ID, key: KEY, runToken: token }, NOW)).rejects.toThrow(
                    new UnauthorizedException("Auto-sync run rejected"),
                );
                expect(mockBankSync.startSyncJob).not.toHaveBeenCalled();
            });

            it("refuses an unknown grant with the same 401", async () => {
                await expect(service.run({ grantId: "unknown", key: KEY, runToken: "x" }, NOW)).rejects.toThrow(
                    new UnauthorizedException("Auto-sync run rejected"),
                );
            });

            it("refuses a grant whose device was removed or moved, with the same 401, before the token is spent", async () => {
                const token = await issue();
                mockPrisma.pushSubscription.findFirst.mockResolvedValueOnce(null);

                await expect(service.run({ grantId: GRANT_ID, key: KEY, runToken: token }, NOW)).rejects.toThrow(
                    new UnauthorizedException("Auto-sync run rejected"),
                );
                expect(mockPrisma.pushSubscription.findFirst).toHaveBeenCalledWith({
                    where: { id: PUSH_ID, userId: USER_ID, removedAt: null },
                    select: { id: true },
                });
                expect(mockPrisma.autoSyncGrant.updateMany).not.toHaveBeenCalled();
                expect(stored.runTokenHash).toBe(sha256Hex(token));
                expect(mockBankSync.startSyncJob).not.toHaveBeenCalled();
            });

            it("checks the device key before the token is touched", async () => {
                const token = await issue();

                await expect(service.run({ grantId: GRANT_ID, key: wrongKey, runToken: token }, NOW)).rejects.toThrow(
                    UnauthorizedException,
                );
                expect(mockPrisma.autoSyncGrant.updateMany).not.toHaveBeenCalled();
                expect(stored.runTokenHash).toBe(sha256Hex(token));
            });

            it("spends the token and reports nothing to sync when no connection is covered", async () => {
                const token = await issue();
                stored.missedRuns = 2;
                mockPrisma.autoSyncCredential.findMany.mockResolvedValueOnce([]);

                await expect(service.run({ grantId: GRANT_ID, key: KEY, runToken: token }, NOW)).rejects.toThrow(
                    new BadRequestException("Nothing to sync"),
                );
                expect(stored.runTokenHash).toBeNull();
                expect(stored.lastRunAt).toBeNull();
                expect(stored.missedRuns).toBe(2);
                expect(mockPush.send).toHaveBeenCalledWith(
                    { subscriptionId: PUSH_ID },
                    expect.objectContaining({
                        type: "auto-sync.result",
                        data: expect.objectContaining({ quiet: true }),
                    }),
                    expect.anything(),
                );
            });

            it("propagates a 409 from startSyncJob after the token was consumed, and closes the progress notification", async () => {
                const token = await issue();
                mockBankSync.startSyncJob.mockRejectedValueOnce(new ConflictException("A sync is already in progress"));

                await expect(service.run({ grantId: GRANT_ID, key: KEY, runToken: token }, NOW)).rejects.toThrow(
                    ConflictException,
                );
                expect(stored.runTokenHash).toBeNull();
                expect(mockPush.send).toHaveBeenCalledWith(
                    { subscriptionId: PUSH_ID },
                    expect.objectContaining({
                        type: "auto-sync.result",
                        data: expect.objectContaining({ quiet: true }),
                    }),
                    expect.anything(),
                );
            });
        });

        describe("run result push (AC21)", () => {
            const summaryOf = (overrides: Partial<SyncJobSummary> = {}): SyncJobSummary => ({
                jobId: "job-1",
                status: "success",
                newTransactions: 0,
                failedConnections: [],
                ...overrides,
            });

            /** Starts a run, then reports the finished job to the source the run was started with. */
            const finishRun = async (summary: SyncJobSummary) => {
                const token = await issue();
                await service.run({ grantId: GRANT_ID, key: KEY, runToken: token }, NOW);
                const source = mockBankSync.startSyncJob.mock.calls[0][2] as CredentialSource;
                await source.onFinished?.(summary);
            };

            it("sends the quiet variant when nothing changed, so the device replaces the progress notification", async () => {
                await finishRun(summaryOf());

                expect(mockPush.send).toHaveBeenCalledWith(
                    { subscriptionId: PUSH_ID },
                    {
                        type: "auto-sync.result",
                        title: "",
                        body: "",
                        url: "/",
                        data: { quiet: true, newTransactions: 0, failedConnectionCount: 0 },
                    },
                    { tag: "auto-sync", ttl: 3600 },
                );
            });

            it("sends the real result even if the user muted auto-sync results", async () => {
                await finishRun(summaryOf({ newTransactions: 3 }));

                expect(mockPrisma.user.findFirst).not.toHaveBeenCalled();
                expect(mockPush.send).toHaveBeenCalledWith(
                    { subscriptionId: PUSH_ID },
                    {
                        type: "auto-sync.result",
                        title: "3 new transactions",
                        body: "",
                        url: "/transactions",
                        data: { quiet: false, newTransactions: 3, failedConnectionCount: 0 },
                    },
                    { tag: "auto-sync", ttl: 3600 },
                );
            });

            it.each([
                [1, "1 new transaction"],
                [3, "3 new transactions"],
            ])("titles %i new transaction(s) and links to the transactions page", async (count, title) => {
                await finishRun(summaryOf({ newTransactions: count }));

                expect(mockPush.send).toHaveBeenCalledWith(
                    { subscriptionId: PUSH_ID },
                    {
                        type: "auto-sync.result",
                        title,
                        body: "",
                        url: "/transactions",
                        data: { quiet: false, newTransactions: count, failedConnectionCount: 0 },
                    },
                    { tag: "auto-sync", ttl: 3600 },
                );
            });

            it("names the one failed connection, and a failure outranks new transactions", async () => {
                await finishRun(
                    summaryOf({
                        newTransactions: 2,
                        failedConnections: [{ id: "c1", displayName: "Bank c1", code: "INVALID_PASSWORD" }],
                    }),
                );

                expect(mockPush.send).toHaveBeenCalledWith(
                    { subscriptionId: PUSH_ID },
                    {
                        type: "auto-sync.result",
                        title: "Bank c1 didn't sync",
                        body: "Tap for details.",
                        url: "/bank-connections",
                        data: { quiet: false, newTransactions: 2, failedConnectionCount: 1 },
                    },
                    { tag: "auto-sync", ttl: 3600 },
                );
            });

            it("counts several failed connections in the title", async () => {
                await finishRun(
                    summaryOf({
                        failedConnections: [
                            { id: "c1", displayName: "Bank c1", code: "INVALID_PASSWORD" },
                            { id: "c2", displayName: "Bank c2", code: "IMPORT_FAILED" },
                        ],
                    }),
                );

                expect(mockPush.send).toHaveBeenCalledWith(
                    { subscriptionId: PUSH_ID },
                    {
                        type: "auto-sync.result",
                        title: "2 connections didn't sync",
                        body: "Tap for details.",
                        url: "/bank-connections",
                        data: { quiet: false, newTransactions: 0, failedConnectionCount: 2 },
                    },
                    { tag: "auto-sync", ttl: 3600 },
                );
            });

            it("deletes the grant when its device subscription is gone", async () => {
                mockPush.send.mockResolvedValueOnce([{ subscriptionId: PUSH_ID, outcome: "gone", statusCode: 410 }]);

                await finishRun(summaryOf({ newTransactions: 1 }));

                expect(mockPrisma.autoSyncCredential.deleteMany).toHaveBeenCalledWith({ where: { grantId: GRANT_ID } });
                expect(mockPrisma.autoSyncGrant.deleteMany).toHaveBeenCalledWith({ where: { id: GRANT_ID } });
            });

            it("deletes the grant without a push when its device subscription was removed", async () => {
                // The run's own ownership check passes; the result push then finds the subscription gone.
                mockPrisma.pushSubscription.findFirst
                    .mockResolvedValueOnce({ id: PUSH_ID })
                    .mockResolvedValueOnce(null);

                await finishRun(summaryOf({ newTransactions: 1 }));

                expect(mockPush.send).not.toHaveBeenCalled();
                expect(mockPrisma.autoSyncGrant.deleteMany).toHaveBeenCalledWith({ where: { id: GRANT_ID } });
            });

            it("deletes the grant without a push when its subscription now belongs to another user", async () => {
                // The run's own ownership check passes; the result push then finds the subscription gone.
                mockPrisma.pushSubscription.findFirst
                    .mockResolvedValueOnce({ id: PUSH_ID })
                    .mockResolvedValueOnce(null);

                await finishRun(summaryOf({ newTransactions: 1 }));

                expect(mockPrisma.pushSubscription.findFirst).toHaveBeenLastCalledWith({
                    where: { id: PUSH_ID, userId: USER_ID, removedAt: null },
                    select: { id: true },
                });
                expect(mockPush.send).not.toHaveBeenCalled();
                expect(mockPrisma.autoSyncGrant.deleteMany).toHaveBeenCalledWith({ where: { id: GRANT_ID } });
            });

            it("keeps the grant when the push fails for another reason", async () => {
                mockPush.send.mockResolvedValueOnce([{ subscriptionId: PUSH_ID, outcome: "failed", statusCode: 500 }]);

                await finishRun(summaryOf({ newTransactions: 1 }));

                expect(mockPrisma.autoSyncGrant.deleteMany).not.toHaveBeenCalled();
            });
        });

        describe("auto credential source", () => {
            const sourceAfterRun = async (): Promise<CredentialSource> => {
                const token = await issue();
                await service.run({ grantId: GRANT_ID, key: KEY, runToken: token }, NOW);
                return mockBankSync.startSyncJob.mock.calls[0][2] as CredentialSource;
            };

            it("hands startSyncJob the covered connections", async () => {
                await sourceAfterRun();

                const connections = mockBankSync.startSyncJob.mock.calls[0][1] as Array<{ id: string }>;
                expect(connections.map((connection) => connection.id)).toEqual(["c1", "c2"]);
            });

            it("resolves every covered connection from the device-held copies", async () => {
                const source = await sourceAfterRun();

                expect(source.resolve({ id: "c1" } as unknown as ScraperConnection)).toEqual({ username: "a" });
                expect(source.resolve({ id: "c2" } as unknown as ScraperConnection)).toEqual({ username: "b" });
            });

            it.each(["INVALID_PASSWORD", "CREDENTIALS_UNREADABLE"] as const)(
                "deletes the copy of the connection on %s (AC9)",
                async (code) => {
                    const source = await sourceAfterRun();

                    await source.onConnectionFailed?.("c1", code);

                    expect(mockPrisma.autoSyncCredential.deleteMany).toHaveBeenCalledWith({
                        where: { grantId: GRANT_ID, connectionId: "c1" },
                    });
                },
            );

            it("keeps the copy on a timeout (AC9)", async () => {
                const source = await sourceAfterRun();

                await source.onConnectionFailed?.("c1", "TIMEOUT");

                expect(mockPrisma.autoSyncCredential.deleteMany).not.toHaveBeenCalled();
            });

            it("fails only the unreadable connection and still resolves the others", async () => {
                mockPrisma.autoSyncCredential.findMany.mockResolvedValueOnce([
                    credentialRow("c1", JSON.stringify({ username: "a" })),
                    {
                        ...credentialRow("c2", JSON.stringify({ username: "b" })),
                        ciphertext: Buffer.from("tampered").toString("base64"),
                    },
                ]);
                const token = await issue();
                await service.run({ grantId: GRANT_ID, key: KEY, runToken: token }, NOW);
                const source = mockBankSync.startSyncJob.mock.calls[0][2] as CredentialSource;

                expect(() => source.resolve({ id: "c2" } as unknown as ScraperConnection)).toThrow(GrantDecryptError);
                expect(source.resolve({ id: "c1" } as unknown as ScraperConnection)).toEqual({ username: "a" });
            });
        });
    });
});

describe("EnableAutoSyncDto validation", () => {
    const validInput = (durationDays?: number) =>
        Object.assign(new EnableAutoSyncDto(), {
            intervalUnit: "hours",
            intervalCount: 4,
            windowStartMinute: 420,
            windowEndMinute: 1320,
            timeZone: TZ,
            pin: PIN,
            key: KEY,
            deviceLabel: "Laptop",
            pushSubscriptionId: PUSH_ID,
            durationDays,
        });

    it.each([7, 30, 90])("accepts a %d day duration (AC5)", async (days) => {
        expect(await validate(validInput(days))).toHaveLength(0);
    });

    it("accepts an omitted duration, which the service defaults to 30 days (AC5)", async () => {
        expect(await validate(validInput(undefined))).toHaveLength(0);
    });

    it("rejects a duration outside the offered set (AC5)", async () => {
        expect(await validate(validInput(14))).not.toHaveLength(0);
    });

    it("rejects a push subscription id that is not a UUID", async () => {
        const dto = Object.assign(validInput(), { pushSubscriptionId: "not-a-uuid" });
        expect(await validate(dto)).not.toHaveLength(0);
    });

    it("rejects a key that is not 32 bytes of base64url", async () => {
        const dto = Object.assign(validInput(), { key: "short" });
        expect(await validate(dto)).not.toHaveLength(0);
    });
});
