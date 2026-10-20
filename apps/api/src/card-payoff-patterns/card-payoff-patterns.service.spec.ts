import { Test, TestingModule } from "@nestjs/testing";
import { CardPayoffPatternsService } from "./card-payoff-patterns.service";
import { PrismaService } from "../prisma/prisma.service";
import { ForbiddenException, BadRequestException } from "@nestjs/common";

describe("CardPayoffPatternsService", () => {
    let service: CardPayoffPatternsService;
    let prisma: PrismaService;

    const mockPrismaService = {
        cardPayoffPattern: {
            findFirst: jest.fn(),
            findMany: jest.fn(),
            create: jest.fn(),
            delete: jest.fn(),
        },
        transaction: {
            updateMany: jest.fn(),
        },
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [CardPayoffPatternsService, { provide: PrismaService, useValue: mockPrismaService }],
        }).compile();

        service = module.get<CardPayoffPatternsService>(CardPayoffPatternsService);
        prisma = module.get<PrismaService>(PrismaService);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe("create", () => {
        it("should create a new pattern", async () => {
            const userId = "user-123";
            const dto = { description: "Test Pattern" };
            const expectedPattern = { id: "pattern-123", userId, description: "Test Pattern", isSystem: false };

            mockPrismaService.cardPayoffPattern.findFirst.mockResolvedValue(null);
            mockPrismaService.cardPayoffPattern.create.mockResolvedValue(expectedPattern);

            const result = await service.create(userId, dto);

            expect(result).toEqual(expectedPattern);
            expect(mockPrismaService.cardPayoffPattern.create).toHaveBeenCalledWith({
                data: {
                    description: dto.description,
                    userId,
                    isSystem: false,
                },
            });
        });

        it("should throw error if pattern already exists", async () => {
            const userId = "user-123";
            const dto = { description: "Existing Pattern" };

            mockPrismaService.cardPayoffPattern.findFirst.mockResolvedValue({ id: "existing-123" });

            await expect(service.create(userId, dto)).rejects.toThrow(BadRequestException);
        });
    });

    describe("findAll", () => {
        it("should return both system and user patterns", async () => {
            const userId = "user-123";
            const patterns = [
                { id: "sys-1", description: "System Pattern", isSystem: true, userId: null },
                { id: "user-1", description: "User Pattern", isSystem: false, userId },
            ];

            mockPrismaService.cardPayoffPattern.findMany.mockResolvedValue(patterns);

            const result = await service.findAll(userId);

            expect(result).toEqual(patterns);
            expect(mockPrismaService.cardPayoffPattern.findMany).toHaveBeenCalledWith({
                where: {
                    OR: [{ isSystem: true }, { userId }],
                },
                orderBy: [{ isSystem: "desc" }, { createdAt: "desc" }],
            });
        });
    });

    describe("remove", () => {
        it("should delete user pattern", async () => {
            const patternId = "pattern-123";
            const userId = "user-123";
            const pattern = { id: patternId, userId, isSystem: false };

            mockPrismaService.cardPayoffPattern.findFirst.mockResolvedValue(pattern);
            mockPrismaService.cardPayoffPattern.delete.mockResolvedValue(pattern);

            const result = await service.remove(patternId, userId);

            expect(result).toEqual(pattern);
            expect(mockPrismaService.cardPayoffPattern.delete).toHaveBeenCalledWith({ where: { id: patternId } });
        });

        it("should prevent deletion of system patterns", async () => {
            const patternId = "sys-pattern-123";
            const userId = "user-123";
            const systemPattern = { id: patternId, userId: null, isSystem: true };

            mockPrismaService.cardPayoffPattern.findFirst.mockResolvedValue(systemPattern);

            await expect(service.remove(patternId, userId)).rejects.toThrow(ForbiddenException);
            expect(mockPrismaService.cardPayoffPattern.delete).not.toHaveBeenCalled();
        });
    });

    describe("checkDescription", () => {
        it("should return true when pattern matches", async () => {
            const userId = "user-123";
            const description = "Test Pattern";

            mockPrismaService.cardPayoffPattern.findFirst.mockResolvedValue({ id: "pattern-123" });

            const result = await service.checkDescription(description, userId);

            expect(result).toBe(true);
        });

        it("should return false when no pattern matches", async () => {
            const userId = "user-123";
            const description = "Unknown Pattern";

            mockPrismaService.cardPayoffPattern.findFirst.mockResolvedValue(null);

            const result = await service.checkDescription(description, userId);

            expect(result).toBe(false);
        });
    });

    describe("applyPatternDescription", () => {
        it("should retag expenses as hidden out-transfers and incomes as hidden in-transfers", async () => {
            const userId = "user-123";

            mockPrismaService.transaction.updateMany
                .mockResolvedValueOnce({ count: 4 }) // from expense
                .mockResolvedValueOnce({ count: 1 }) // from income
                .mockResolvedValueOnce({ count: 2 }); // re-hidden transfers

            const result = await service.applyPatternDescription(userId, "Pattern 1");

            expect(result.count).toBe(7);
            expect(mockPrismaService.transaction.updateMany).toHaveBeenNthCalledWith(1, {
                where: { userId, description: "Pattern 1", deletedAt: null, type: "expense" },
                data: { type: "transfer", hidden: true, transferDirection: "out" },
            });
            expect(mockPrismaService.transaction.updateMany).toHaveBeenNthCalledWith(2, {
                where: { userId, description: "Pattern 1", deletedAt: null, type: "income" },
                data: { type: "transfer", hidden: true, transferDirection: "in" },
            });
            expect(mockPrismaService.transaction.updateMany).toHaveBeenNthCalledWith(3, {
                where: {
                    userId,
                    description: "Pattern 1",
                    deletedAt: null,
                    type: "transfer",
                    hidden: false,
                    counterpartOfId: null,
                    counterpart: { is: null },
                },
                data: { hidden: true },
            });
        });
    });

    describe("applyAllPatternsToTransactions", () => {
        it("should apply all patterns to matching transactions", async () => {
            const userId = "user-123";
            const patterns = [
                { id: "p1", description: "Pattern 1", isSystem: true },
                { id: "p2", description: "Pattern 2", isSystem: false, userId },
            ];

            mockPrismaService.cardPayoffPattern.findMany.mockResolvedValue(patterns);
            // 3 updateMany calls per pattern (expense, income, re-hide)
            mockPrismaService.transaction.updateMany
                .mockResolvedValueOnce({ count: 5 })
                .mockResolvedValueOnce({ count: 0 })
                .mockResolvedValueOnce({ count: 0 })
                .mockResolvedValueOnce({ count: 3 })
                .mockResolvedValueOnce({ count: 0 })
                .mockResolvedValueOnce({ count: 0 });

            const result = await service.applyAllPatternsToTransactions(userId);

            expect(result.count).toBe(8);
            expect(mockPrismaService.transaction.updateMany).toHaveBeenCalledTimes(6);
            expect(mockPrismaService.transaction.updateMany).toHaveBeenCalledWith({
                where: {
                    userId,
                    description: "Pattern 1",
                    deletedAt: null,
                    type: "expense",
                },
                data: {
                    type: "transfer",
                    hidden: true,
                    transferDirection: "out",
                },
            });
        });

        it("should return zero count when no transactions match", async () => {
            const userId = "user-123";
            const patterns = [{ id: "p1", description: "Pattern 1", isSystem: true }];

            mockPrismaService.cardPayoffPattern.findMany.mockResolvedValue(patterns);
            mockPrismaService.transaction.updateMany.mockResolvedValue({ count: 0 });

            const result = await service.applyAllPatternsToTransactions(userId);

            expect(result.count).toBe(0);
        });
    });
});
