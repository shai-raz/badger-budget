import { randomBytes } from "crypto";
import { validate } from "class-validator";
import { Test, TestingModule } from "@nestjs/testing";
import { BadRequestException, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AUTO_SYNC_JITTER_MS } from "./auto-sync-schedule";
import { AUTO_SYNC_UNREACHABLE_AFTER_MS, AutoSyncService } from "./auto-sync.service";
import { BankSyncService } from "./bank-sync.service";
import { EnableAutoSyncDto } from "./dto/enable-auto-sync.dto";
import { UpdateAutoSyncScheduleDto } from "./dto/update-auto-sync-schedule.dto";
import { PrismaService } from "../prisma/prisma.service";
import { CredentialCryptoService } from "../crypto/credential-crypto.service";

const DAY = 86_400_000;
const PIN = "1234";
const PEPPER = "test-pepper-value";
const TZ = "Asia/Jerusalem";
const NOW = new Date("2026-11-11T10:00:00.000Z");
const USER_ID = "user-1";
const KEY = randomBytes(32).toString("base64url");
const GRANT_ID = "00000000-0000-4000-8000-000000000001";

describe("AutoSyncService", () => {
    let service: AutoSyncService;
    let crypto: CredentialCryptoService;

    const mockPrisma = {
        scraperConnection: { findMany: jest.fn() },
        autoSyncGrant: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), deleteMany: jest.fn() },
        autoSyncCredential: { findMany: jest.fn(), createMany: jest.fn(), deleteMany: jest.fn() },
        $transaction: jest.fn(),
    };

    const mockBankSync = { verifyUserPin: jest.fn() };

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
            ],
        }).compile();

        service = module.get(AutoSyncService);
        crypto = module.get(CredentialCryptoService);

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

    it("rejects a key that is not 32 bytes of base64url", async () => {
        const dto = Object.assign(validInput(), { key: "short" });
        expect(await validate(dto)).not.toHaveLength(0);
    });
});
