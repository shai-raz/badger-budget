import { Test, TestingModule } from "@nestjs/testing";
import { SyncRecoveryService } from "./sync-recovery.service";
import { PrismaService } from "../prisma/prisma.service";

describe("SyncRecoveryService", () => {
    let service: SyncRecoveryService;

    // $transaction hands the callback the same mock, so tx.* and the top-level mock are one spy.
    const tx = {
        scraperJob: { updateMany: jest.fn() },
        syncJob: { updateMany: jest.fn() },
    };
    const mockPrismaService = {
        syncJob: { findMany: jest.fn(), updateMany: tx.syncJob.updateMany },
        scraperJob: tx.scraperJob,
        $transaction: jest.fn(async (cb: (client: typeof tx) => unknown) => cb(tx)),
    };

    beforeEach(async () => {
        jest.clearAllMocks();
        mockPrismaService.syncJob.findMany.mockResolvedValue([]);
        tx.scraperJob.updateMany.mockResolvedValue({ count: 0 });
        tx.syncJob.updateMany.mockResolvedValue({ count: 0 });

        const module: TestingModule = await Test.createTestingModule({
            providers: [SyncRecoveryService, { provide: PrismaService, useValue: mockPrismaService }],
        }).compile();

        service = module.get<SyncRecoveryService>(SyncRecoveryService);
        jest.spyOn(service["logger"], "log").mockImplementation(() => undefined);
        jest.spyOn(service["logger"], "error").mockImplementation(() => undefined);
    });

    it("closes pending and running runs created before this boot, and their scraper jobs", async () => {
        mockPrismaService.syncJob.findMany.mockResolvedValue([{ id: "sync-1" }, { id: "sync-2" }]);

        const result = await service.recover();

        expect(mockPrismaService.syncJob.findMany).toHaveBeenCalledWith({
            where: { status: { in: ["pending", "running"] }, createdAt: { lt: expect.any(Date) } },
            select: { id: true },
        });
        expect(tx.scraperJob.updateMany).toHaveBeenCalledWith({
            where: { syncJobId: { in: ["sync-1", "sync-2"] }, status: { in: ["pending", "running"] } },
            data: {
                status: "failed",
                errorCode: "INTERRUPTED",
                error: "Interrupted by a server restart",
                finishedAt: expect.any(Date),
            },
        });
        expect(tx.syncJob.updateMany).toHaveBeenCalledWith({
            where: { id: { in: ["sync-1", "sync-2"] } },
            data: { status: "interrupted", error: "Interrupted by a server restart", finishedAt: expect.any(Date) },
        });
        expect(result).toEqual({ runs: 2 });
    });

    it("is a no-op when no runs were left unfinished", async () => {
        const result = await service.recover();

        expect(mockPrismaService.$transaction).not.toHaveBeenCalled();
        expect(tx.scraperJob.updateMany).not.toHaveBeenCalled();
        expect(tx.syncJob.updateMany).not.toHaveBeenCalled();
        expect(result).toEqual({ runs: 0 });
    });

    it("swallows a Prisma error during onApplicationBootstrap and logs it", async () => {
        const failure = new Error("db down");
        mockPrismaService.syncJob.findMany.mockRejectedValue(failure);

        await expect(service.onApplicationBootstrap()).resolves.toBeUndefined();

        expect(service["logger"].error).toHaveBeenCalledWith("Sync recovery failed", failure);
    });
});
