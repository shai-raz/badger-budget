import { Test, TestingModule } from "@nestjs/testing";
import { CashWithdrawalPatternsService } from "./cash-withdrawal-patterns.service";
import { PrismaService } from "../prisma/prisma.service";

describe("CashWithdrawalPatternsService", () => {
    let service: CashWithdrawalPatternsService;

    const mockPrismaService = {
        cashWithdrawalPattern: { findMany: jest.fn() },
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [CashWithdrawalPatternsService, { provide: PrismaService, useValue: mockPrismaService }],
        }).compile();
        service = module.get(CashWithdrawalPatternsService);
    });

    afterEach(() => jest.clearAllMocks());

    describe("findAll", () => {
        it("returns system patterns and the caller's own, system first", async () => {
            const rows = [{ id: "sys", isSystem: true }];
            mockPrismaService.cashWithdrawalPattern.findMany.mockResolvedValue(rows);

            const result = await service.findAll("user-1");

            expect(result).toBe(rows);
            expect(mockPrismaService.cashWithdrawalPattern.findMany).toHaveBeenCalledWith({
                where: { OR: [{ isSystem: true }, { userId: "user-1" }] },
                orderBy: [{ isSystem: "desc" }, { createdAt: "asc" }],
            });
        });

        it("scopes user rows to the requesting user only", async () => {
            mockPrismaService.cashWithdrawalPattern.findMany.mockResolvedValue([]);

            await service.findAll("user-2");

            const { where } = mockPrismaService.cashWithdrawalPattern.findMany.mock.calls[0][0];
            expect(where.OR).toContainEqual({ userId: "user-2" });
            expect(where.OR).not.toContainEqual({ userId: "user-1" });
        });
    });
});
