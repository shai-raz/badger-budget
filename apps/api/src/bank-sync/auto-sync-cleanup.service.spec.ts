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

    it("ticks on bootstrap without waiting for the database", () => {
        expect(() => service.onApplicationBootstrap()).not.toThrow();
        expect(mockPrisma.autoSyncCredential.deleteMany).toHaveBeenCalledTimes(1);
    });

    it("is registered as an hourly @nestjs/schedule interval", () => {
        // @nestjs/schedule keeps its interval options under this metadata key on the handler.
        expect(Reflect.getMetadata("SCHEDULE_INTERVAL_OPTIONS", AutoSyncCleanupService.prototype.tick)).toEqual({
            timeout: 60 * 60 * 1000,
        });
    });
});
