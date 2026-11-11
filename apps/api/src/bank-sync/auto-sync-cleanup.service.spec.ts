import { Test, TestingModule } from "@nestjs/testing";
import { AutoSyncCleanupService } from "./auto-sync-cleanup.service";
import { PrismaService } from "../prisma/prisma.service";

describe("AutoSyncCleanupService", () => {
    let service: AutoSyncCleanupService;

    const mockPrisma = {
        autoSyncCredential: { deleteMany: jest.fn() },
        autoSyncGrant: { deleteMany: jest.fn() },
    };

    beforeEach(async () => {
        jest.clearAllMocks();
        mockPrisma.autoSyncCredential.deleteMany.mockResolvedValue({ count: 0 });
        mockPrisma.autoSyncGrant.deleteMany.mockResolvedValue({ count: 0 });

        const module: TestingModule = await Test.createTestingModule({
            providers: [AutoSyncCleanupService, { provide: PrismaService, useValue: mockPrisma }],
        }).compile();

        service = module.get<AutoSyncCleanupService>(AutoSyncCleanupService);
        jest.spyOn(service["logger"], "error").mockImplementation(() => undefined);
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    it("deletes expired credentials, then expired grants, both filtered on the given instant", async () => {
        const now = new Date("2026-11-11T10:00:00Z");

        await service.tick(now);

        expect(mockPrisma.autoSyncCredential.deleteMany).toHaveBeenCalledWith({
            where: { grant: { expiresAt: { lte: now } } },
        });
        expect(mockPrisma.autoSyncGrant.deleteMany).toHaveBeenCalledWith({
            where: { expiresAt: { lte: now } },
        });
        expect(mockPrisma.autoSyncCredential.deleteMany.mock.invocationCallOrder[0]).toBeLessThan(
            mockPrisma.autoSyncGrant.deleteMany.mock.invocationCallOrder[0],
        );
    });

    it("does not throw when Prisma rejects, and logs the failure", async () => {
        mockPrisma.autoSyncCredential.deleteMany.mockRejectedValue(new Error("db down"));

        await expect(service.tick()).resolves.toBeUndefined();
        expect(service["logger"].error).toHaveBeenCalledTimes(1);
        expect(mockPrisma.autoSyncGrant.deleteMany).not.toHaveBeenCalled();
    });

    it("ticks once on bootstrap, hourly after that, and stops on destroy", async () => {
        jest.useFakeTimers();

        await service.onApplicationBootstrap();
        expect(mockPrisma.autoSyncCredential.deleteMany).toHaveBeenCalledTimes(1);

        jest.advanceTimersByTime(60 * 60 * 1000);
        expect(mockPrisma.autoSyncCredential.deleteMany).toHaveBeenCalledTimes(2);

        service.onModuleDestroy();
        jest.advanceTimersByTime(60 * 60 * 1000);
        expect(mockPrisma.autoSyncCredential.deleteMany).toHaveBeenCalledTimes(2);
    });
});
