import { Test, TestingModule } from "@nestjs/testing";
import { errorCodeFromLegacyMessage, SyncErrorCodeBackfillService } from "./sync-error-code-backfill.service";
import { PrismaService } from "../prisma/prisma.service";

describe("errorCodeFromLegacyMessage", () => {
    it.each([
        ["Scraper failed: INVALID_PASSWORD — wrong password", "INVALID_PASSWORD"],
        ["Scraper failed: CHANGE_PASSWORD — password expired", "CHANGE_PASSWORD"],
        ["Scraper failed: ACCOUNT_BLOCKED — account locked", "ACCOUNT_BLOCKED"],
        ["Scraper failed: TIMEOUT — page did not load", "TIMEOUT"],
        ["Scraper failed: TWO_FACTOR_RETRIEVER_MISSING — no retriever", "TWO_FACTOR_RETRIEVER_MISSING"],
        ["Scraper failed: GENERIC — something odd", "GENERIC"],
        ["Scraper failed: GENERAL_ERROR — something else", "GENERAL_ERROR"],
        ["Scraper failed: NOT_A_REAL_TYPE — unknown provider error", "UNKNOWN"],
        ["Invalid PIN", "CREDENTIALS_UNREADABLE"],
        [null, "UNKNOWN"],
        ["Import failed: 3 rows rejected", "UNKNOWN"],
    ])("maps %j to %s", (message, expected) => {
        expect(errorCodeFromLegacyMessage(message)).toBe(expected);
    });
});

describe("SyncErrorCodeBackfillService", () => {
    let service: SyncErrorCodeBackfillService;

    // $transaction hands the callback the same mock, so tx.* and the top-level mock are one spy.
    const tx = {
        dataBackfill: { createMany: jest.fn() },
        scraperJob: { findMany: jest.fn(), updateMany: jest.fn() },
    };
    const mockPrismaService = {
        ...tx,
        $transaction: jest.fn(async (cb: (client: typeof tx) => unknown) => cb(tx)),
    };

    beforeEach(async () => {
        jest.clearAllMocks();
        tx.dataBackfill.createMany.mockResolvedValue({ count: 1 });
        tx.scraperJob.findMany.mockResolvedValue([]);
        tx.scraperJob.updateMany.mockResolvedValue({ count: 0 });

        const module: TestingModule = await Test.createTestingModule({
            providers: [SyncErrorCodeBackfillService, { provide: PrismaService, useValue: mockPrismaService }],
        }).compile();

        service = module.get<SyncErrorCodeBackfillService>(SyncErrorCodeBackfillService);
        jest.spyOn(service["logger"], "log").mockImplementation(() => undefined);
        jest.spyOn(service["logger"], "error").mockImplementation(() => undefined);
    });

    it("does no work once the marker is already claimed", async () => {
        tx.dataBackfill.createMany.mockResolvedValue({ count: 0 });

        const result = await service.run();

        expect(tx.dataBackfill.createMany).toHaveBeenCalledWith({
            data: [{ name: "sync-error-codes-v1" }],
            skipDuplicates: true,
        });
        expect(tx.scraperJob.findMany).not.toHaveBeenCalled();
        expect(tx.scraperJob.updateMany).not.toHaveBeenCalled();
        expect(result).toEqual({ claimed: false, classified: 0, closed: 0 });
    });

    it("classifies failed scraper jobs with one updateMany per code", async () => {
        tx.scraperJob.findMany.mockResolvedValueOnce([
            { id: "a", error: "Scraper failed: TIMEOUT — slow page" },
            { id: "b", error: "Scraper failed: TIMEOUT — another slow page" },
            { id: "c", error: "Invalid PIN" },
            { id: "d", error: "Import failed: 1 row" },
        ]);
        tx.scraperJob.updateMany.mockImplementation(async ({ where }: { where: { id?: { in: string[] } } }) => ({
            count: where.id?.in.length ?? 0,
        }));

        const result = await service.run();

        expect(tx.scraperJob.findMany).toHaveBeenCalledWith({
            where: { status: "failed", errorCode: null },
            select: { id: true, error: true },
        });
        expect(tx.scraperJob.updateMany).toHaveBeenCalledWith({
            where: { id: { in: ["a", "b"] } },
            data: { errorCode: "TIMEOUT" },
        });
        expect(tx.scraperJob.updateMany).toHaveBeenCalledWith({
            where: { id: { in: ["c"] } },
            data: { errorCode: "CREDENTIALS_UNREADABLE" },
        });
        expect(tx.scraperJob.updateMany).toHaveBeenCalledWith({
            where: { id: { in: ["d"] } },
            data: { errorCode: "UNKNOWN" },
        });
        expect(result).toEqual({ claimed: true, classified: 4, closed: 0 });
    });

    it("closes stale unfinished scraper jobs: never-started get SYNC_START_FAILED, the rest UNKNOWN", async () => {
        const stale = {
            status: { in: ["pending", "running"] },
            syncJob: { status: { notIn: ["pending", "running"] } },
        };
        tx.scraperJob.updateMany.mockResolvedValueOnce({ count: 2 }).mockResolvedValueOnce({ count: 3 });

        const result = await service.run();

        expect(tx.scraperJob.updateMany).toHaveBeenCalledWith({
            where: { ...stale, startedAt: null },
            data: { status: "failed", errorCode: "SYNC_START_FAILED", finishedAt: expect.any(Date) },
        });
        expect(tx.scraperJob.updateMany).toHaveBeenCalledWith({
            where: { ...stale, startedAt: { not: null } },
            data: { status: "failed", errorCode: "UNKNOWN", finishedAt: expect.any(Date) },
        });
        expect(result).toEqual({ claimed: true, classified: 0, closed: 5 });
    });

    it("propagates a failure so the transaction rolls back and the marker is not kept", async () => {
        tx.scraperJob.findMany.mockRejectedValue(new Error("db down"));

        await expect(service.run()).rejects.toThrow("db down");
    });

    it("onApplicationBootstrap swallows a failed run and logs it", async () => {
        const failure = new Error("db down");
        jest.spyOn(service, "run").mockRejectedValue(failure);

        expect(() => service.onApplicationBootstrap()).not.toThrow();
        await new Promise((resolve) => setImmediate(resolve));

        expect(service["logger"].error).toHaveBeenCalledWith("Sync error code backfill failed", failure);
    });
});
