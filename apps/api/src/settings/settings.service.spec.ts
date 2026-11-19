import { Test, TestingModule } from "@nestjs/testing";
import { SettingsService } from "./settings.service";
import { PrismaService } from "../prisma/prisma.service";

describe("SettingsService", () => {
    let service: SettingsService;

    const mockPrismaService = {
        category: { count: jest.fn() },
        rule: { count: jest.fn() },
        cardPayoffPattern: { count: jest.fn() },
        syncPasskey: { count: jest.fn() },
        oAuthGrant: { findMany: jest.fn() },
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [SettingsService, { provide: PrismaService, useValue: mockPrismaService }],
        }).compile();

        service = module.get<SettingsService>(SettingsService);

        mockPrismaService.category.count.mockResolvedValue(0);
        mockPrismaService.rule.count.mockResolvedValue(0);
        mockPrismaService.cardPayoffPattern.count.mockResolvedValue(0);
        mockPrismaService.syncPasskey.count.mockResolvedValue(0);
        mockPrismaService.oAuthGrant.findMany.mockResolvedValue([]);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe("getSummary", () => {
        it("returns the live counts and connected app names", async () => {
            mockPrismaService.category.count.mockResolvedValue(7);
            mockPrismaService.rule.count.mockResolvedValue(3);
            mockPrismaService.cardPayoffPattern.count.mockResolvedValue(5);
            mockPrismaService.syncPasskey.count.mockResolvedValue(2);
            mockPrismaService.oAuthGrant.findMany.mockResolvedValue([
                { client: { clientName: "Claude" } },
                { client: { clientName: "ChatGPT" } },
            ]);

            await expect(service.getSummary("user-1")).resolves.toEqual({
                categories: 7,
                rules: 3,
                cardPayoffPatterns: 5,
                passkeys: 2,
                connectedApps: ["Claude", "ChatGPT"],
            });
        });

        it("counts only the user's own non-system, non-deleted categories", async () => {
            await service.getSummary("user-1");

            expect(mockPrismaService.category.count).toHaveBeenCalledWith({
                where: { userId: "user-1", isSystem: false, deletedAt: null },
            });
        });

        it("counts only the user's non-deleted rules", async () => {
            await service.getSummary("user-1");

            expect(mockPrismaService.rule.count).toHaveBeenCalledWith({
                where: { userId: "user-1", deletedAt: null },
            });
        });

        it("counts system patterns plus the user's own card payoff patterns", async () => {
            await service.getSummary("user-1");

            expect(mockPrismaService.cardPayoffPattern.count).toHaveBeenCalledWith({
                where: { OR: [{ isSystem: true }, { userId: "user-1" }] },
            });
        });

        it("counts the user's sync passkeys", async () => {
            await service.getSummary("user-1");

            expect(mockPrismaService.syncPasskey.count).toHaveBeenCalledWith({
                where: { userId: "user-1" },
            });
        });

        it("queries only active grants, newest first, selecting just the client name", async () => {
            await service.getSummary("user-1");

            expect(mockPrismaService.oAuthGrant.findMany).toHaveBeenCalledWith({
                where: { userId: "user-1", revokedAt: null },
                select: { client: { select: { clientName: true } } },
                orderBy: { createdAt: "desc" },
            });
        });

        it("collapses duplicate client names while keeping first-seen order", async () => {
            mockPrismaService.oAuthGrant.findMany.mockResolvedValue([
                { client: { clientName: "Claude" } },
                { client: { clientName: "ChatGPT" } },
                { client: { clientName: "Claude" } },
            ]);

            const result = await service.getSummary("user-1");

            expect(result.connectedApps).toEqual(["Claude", "ChatGPT"]);
        });

        it("returns zeros and an empty list for a user with no data", async () => {
            await expect(service.getSummary("user-1")).resolves.toEqual({
                categories: 0,
                rules: 0,
                cardPayoffPatterns: 0,
                passkeys: 0,
                connectedApps: [],
            });
        });
    });
});
