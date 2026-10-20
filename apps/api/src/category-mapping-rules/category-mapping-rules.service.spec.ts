import { CategoryMappingRulesService } from "./category-mapping-rules.service";

// Mocked to isolate the unit under test.
jest.mock("@badger/utils", () => ({
    findMatchingCategoryId: jest.fn().mockReturnValue("cat-1"),
}));

describe("CategoryMappingRulesService.applyRuleToAllTransactions", () => {
    const prisma = {
        transaction: { findMany: jest.fn(), updateMany: jest.fn() },
        categoryMappingRule: { findFirst: jest.fn() },
    };
    const service = new CategoryMappingRulesService(prisma as any);

    beforeEach(() => {
        jest.clearAllMocks();
        prisma.categoryMappingRule.findFirst.mockResolvedValue({ id: "r1", userId: "u1", isActive: true });
        prisma.transaction.findMany.mockResolvedValue([]);
        prisma.transaction.updateMany.mockResolvedValue({ count: 0 });
    });

    it("never loads linked mirror rows", async () => {
        await service.applyRuleToAllTransactions("r1", "u1");

        expect(prisma.transaction.findMany).toHaveBeenCalledWith(
            expect.objectContaining({ where: { userId: "u1", deletedAt: null, counterpartOfId: null } }),
        );
    });
});
