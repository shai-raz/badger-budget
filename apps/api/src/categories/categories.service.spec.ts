import { Test, TestingModule } from "@nestjs/testing";
import { NotFoundException, ForbiddenException, BadRequestException } from "@nestjs/common";
import { CategoriesService } from "./categories.service";
import { PrismaService } from "../prisma/prisma.service";

describe("CategoriesService", () => {
    let service: CategoriesService;
    let prisma: PrismaService;

    const mockPrismaService = {
        category: {
            create: jest.fn(),
            findMany: jest.fn(),
            findFirst: jest.fn(),
            update: jest.fn(),
        },
        transaction: {
            updateMany: jest.fn(),
            count: jest.fn(),
        },
        budget: {
            updateMany: jest.fn(),
            count: jest.fn(),
        },
        budgetCategory: {
            findMany: jest.fn(),
            deleteMany: jest.fn(),
            updateMany: jest.fn(),
        },
        categoryMappingRule: {
            findMany: jest.fn(),
            updateMany: jest.fn(),
            deleteMany: jest.fn(),
            count: jest.fn(),
        },
        // remove() detaches dependents inside a transaction. Hand the callback
        // the same mock so `tx.category.update` and `prisma.category.update`
        // are the one spy the assertions below check.
        $transaction: jest.fn(async (cb) => cb(mockPrismaService)),
    };

    // remove() calls several updateMany/deleteMany/findMany that would otherwise
    // return undefined. Give them safe defaults; clearAllMocks() wipes these
    // between tests so they are re-applied here before each test runs.
    const applyRemoveDefaults = () => {
        mockPrismaService.budgetCategory.findMany.mockResolvedValue([]);
        mockPrismaService.budgetCategory.deleteMany.mockResolvedValue({ count: 0 });
        mockPrismaService.budgetCategory.updateMany.mockResolvedValue({ count: 0 });
        mockPrismaService.transaction.updateMany.mockResolvedValue({ count: 0 });
        mockPrismaService.budget.updateMany.mockResolvedValue({ count: 0 });
        mockPrismaService.categoryMappingRule.findMany.mockResolvedValue([]);
        mockPrismaService.categoryMappingRule.updateMany.mockResolvedValue({ count: 0 });
        mockPrismaService.categoryMappingRule.deleteMany.mockResolvedValue({ count: 0 });
    };

    const mockCategory = {
        id: "category-id",
        userId: "test-user",
        name: "Test Category",
        icon: "🏠",
        color: "#FF0000",
        isSystem: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
    };

    const mockSystemCategory = {
        ...mockCategory,
        id: "system-category-id",
        userId: null,
        name: "Groceries",
        isSystem: true,
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                CategoriesService,
                {
                    provide: PrismaService,
                    useValue: mockPrismaService,
                },
            ],
        }).compile();

        service = module.get<CategoriesService>(CategoriesService);
        prisma = module.get<PrismaService>(PrismaService);

        applyRemoveDefaults();
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe("create", () => {
        it("should create a user category", async () => {
            const createDto = {
                name: "Test Category",
                icon: "🏠",
                color: "#FF0000",
            };

            mockPrismaService.category.create.mockResolvedValue(mockCategory);

            const result = await service.create("test-user", createDto);

            expect(result).toEqual(mockCategory);
            expect(mockPrismaService.category.create).toHaveBeenCalledWith({
                data: {
                    ...createDto,
                    userId: "test-user",
                    isSystem: false,
                },
            });
        });
    });

    describe("findAll", () => {
        it("should return both system and user categories", async () => {
            mockPrismaService.category.findMany.mockResolvedValue([mockSystemCategory, mockCategory]);

            const result = await service.findAll("test-user");

            expect(result).toHaveLength(2);
            expect(mockPrismaService.category.findMany).toHaveBeenCalledWith({
                where: {
                    OR: [
                        { isSystem: true, deletedAt: null },
                        { userId: "test-user", deletedAt: null },
                    ],
                },
                orderBy: [{ isSystem: "desc" }, { name: "asc" }],
            });
        });
    });

    describe("findOne", () => {
        it("should return a category by id", async () => {
            mockPrismaService.category.findFirst.mockResolvedValue(mockCategory);

            const result = await service.findOne("category-id", "test-user");

            expect(result).toEqual(mockCategory);
            expect(mockPrismaService.category.findFirst).toHaveBeenCalledWith({
                where: {
                    id: "category-id",
                    OR: [{ isSystem: true }, { userId: "test-user" }],
                    deletedAt: null,
                },
            });
        });

        it("should throw NotFoundException if category not found", async () => {
            mockPrismaService.category.findFirst.mockResolvedValue(null);

            await expect(service.findOne("non-existent", "test-user")).rejects.toThrow(NotFoundException);
        });
    });

    describe("update", () => {
        it("should update a user category", async () => {
            const updateDto = { name: "Updated Category" };

            // findOne() looks the category up, then update() runs a second
            // findFirst for the duplicate-name check -- that one must miss.
            mockPrismaService.category.findFirst.mockResolvedValueOnce(mockCategory).mockResolvedValueOnce(null);
            mockPrismaService.category.update.mockResolvedValue({
                ...mockCategory,
                ...updateDto,
            });

            const result = await service.update("category-id", "test-user", updateDto);

            expect(result.name).toBe("Updated Category");
            expect(mockPrismaService.category.update).toHaveBeenCalled();
        });

        it("should throw ForbiddenException when trying to update system category", async () => {
            mockPrismaService.category.findFirst.mockResolvedValue(mockSystemCategory);

            await expect(service.update("system-category-id", "test-user", { name: "Updated" })).rejects.toThrow(
                ForbiddenException,
            );
        });
    });

    describe("remove", () => {
        const mockTargetCategory = {
            ...mockCategory,
            id: "target-id",
            name: "Target Category",
        };

        it("should leave dependents uncategorized when no transfer target is given", async () => {
            mockPrismaService.category.findFirst.mockResolvedValue(mockCategory);
            mockPrismaService.category.update.mockResolvedValue({
                ...mockCategory,
                deletedAt: new Date(),
            });

            const result = await service.remove("category-id", "test-user");

            expect(result.deletedAt).toBeTruthy();

            // Transactions and the legacy scalar budget link are nulled out.
            expect(mockPrismaService.transaction.updateMany).toHaveBeenCalledWith({
                where: { categoryId: "category-id", userId: "test-user" },
                data: { categoryId: null },
            });
            expect(mockPrismaService.budget.updateMany).toHaveBeenCalledWith({
                where: { categoryId: "category-id", userId: "test-user" },
                data: { categoryId: null },
            });

            // Join rows and mapping rules are deleted (nothing is re-pointed).
            expect(mockPrismaService.budgetCategory.deleteMany).toHaveBeenCalledWith({
                where: { categoryId: "category-id" },
            });
            expect(mockPrismaService.budgetCategory.updateMany).not.toHaveBeenCalled();
            expect(mockPrismaService.categoryMappingRule.deleteMany).toHaveBeenCalledWith({
                where: { categoryId: "category-id", userId: "test-user" },
            });
            expect(mockPrismaService.categoryMappingRule.updateMany).not.toHaveBeenCalled();

            expect(mockPrismaService.category.update).toHaveBeenCalledWith({
                where: { id: "category-id" },
                data: { deletedAt: expect.any(Date) },
            });
        });

        it("should re-point all dependents to the target when transferring (no collisions)", async () => {
            mockPrismaService.category.findFirst
                .mockResolvedValueOnce(mockCategory)
                .mockResolvedValueOnce(mockTargetCategory);
            mockPrismaService.budgetCategory.findMany.mockResolvedValue([]);
            mockPrismaService.category.update.mockResolvedValue({
                ...mockCategory,
                deletedAt: new Date(),
            });

            const result = await service.remove("category-id", "test-user", {
                transferToCategoryId: "target-id",
            });

            expect(result.deletedAt).toBeTruthy();

            expect(mockPrismaService.transaction.updateMany).toHaveBeenCalledWith({
                where: { categoryId: "category-id", userId: "test-user" },
                data: { categoryId: "target-id" },
            });
            expect(mockPrismaService.budget.updateMany).toHaveBeenCalledWith({
                where: { categoryId: "category-id", userId: "test-user" },
                data: { categoryId: "target-id" },
            });
            expect(mockPrismaService.budgetCategory.updateMany).toHaveBeenCalledWith({
                where: { categoryId: "category-id" },
                data: { categoryId: "target-id" },
            });
            // No budget already linked to the target -> no dedupe delete.
            expect(mockPrismaService.budgetCategory.deleteMany).not.toHaveBeenCalled();

            // Mapping rules move by default.
            expect(mockPrismaService.categoryMappingRule.updateMany).toHaveBeenCalledWith({
                where: { categoryId: "category-id", userId: "test-user" },
                data: { categoryId: "target-id" },
            });
            expect(mockPrismaService.categoryMappingRule.deleteMany).not.toHaveBeenCalled();

            expect(mockPrismaService.category.update).toHaveBeenCalledWith({
                where: { id: "category-id" },
                data: { deletedAt: expect.any(Date) },
            });
        });

        it("should delete colliding join rows before re-pointing the rest when transferring", async () => {
            mockPrismaService.category.findFirst
                .mockResolvedValueOnce(mockCategory)
                .mockResolvedValueOnce(mockTargetCategory);
            // Two budgets are already linked to the target -> their source rows collide.
            mockPrismaService.budgetCategory.findMany.mockResolvedValue([{ budgetId: "b1" }, { budgetId: "b2" }]);
            mockPrismaService.category.update.mockResolvedValue({
                ...mockCategory,
                deletedAt: new Date(),
            });

            await service.remove("category-id", "test-user", {
                transferToCategoryId: "target-id",
            });

            expect(mockPrismaService.budgetCategory.deleteMany).toHaveBeenCalledWith({
                where: { categoryId: "category-id", budgetId: { in: ["b1", "b2"] } },
            });
            expect(mockPrismaService.budgetCategory.updateMany).toHaveBeenCalledWith({
                where: { categoryId: "category-id" },
                data: { categoryId: "target-id" },
            });

            // The collision cleanup must run before the re-point.
            const deleteOrder = mockPrismaService.budgetCategory.deleteMany.mock.invocationCallOrder[0];
            const updateOrder = mockPrismaService.budgetCategory.updateMany.mock.invocationCallOrder[0];
            expect(deleteOrder).toBeLessThan(updateOrder);
        });

        it("should delete duplicate mapping rules before re-pointing the rest when transferring", async () => {
            mockPrismaService.category.findFirst
                .mockResolvedValueOnce(mockCategory)
                .mockResolvedValueOnce(mockTargetCategory);
            // One source rule duplicates an existing target rule; the other is unique.
            mockPrismaService.categoryMappingRule.findMany
                .mockResolvedValueOnce([{ field: "description", operator: "contains", value: "coffee" }]) // target rules
                .mockResolvedValueOnce([
                    // source rules
                    { id: "rule-dup", field: "description", operator: "contains", value: "coffee" },
                    { id: "rule-keep", field: "description", operator: "equals", value: "rent" },
                ]);
            mockPrismaService.category.update.mockResolvedValue({
                ...mockCategory,
                deletedAt: new Date(),
            });

            await service.remove("category-id", "test-user", {
                transferToCategoryId: "target-id",
            });

            expect(mockPrismaService.categoryMappingRule.deleteMany).toHaveBeenCalledWith({
                where: { id: { in: ["rule-dup"] } },
            });
            expect(mockPrismaService.categoryMappingRule.updateMany).toHaveBeenCalledWith({
                where: { categoryId: "category-id", userId: "test-user" },
                data: { categoryId: "target-id" },
            });

            // The dedupe cleanup must run before the re-point.
            const deleteOrder = mockPrismaService.categoryMappingRule.deleteMany.mock.invocationCallOrder[0];
            const updateOrder = mockPrismaService.categoryMappingRule.updateMany.mock.invocationCallOrder[0];
            expect(deleteOrder).toBeLessThan(updateOrder);
        });

        it("should delete mapping rules instead of moving them when moveMappingRules is false", async () => {
            mockPrismaService.category.findFirst
                .mockResolvedValueOnce(mockCategory)
                .mockResolvedValueOnce(mockTargetCategory);
            mockPrismaService.budgetCategory.findMany.mockResolvedValue([]);
            mockPrismaService.category.update.mockResolvedValue({
                ...mockCategory,
                deletedAt: new Date(),
            });

            await service.remove("category-id", "test-user", {
                transferToCategoryId: "target-id",
                moveMappingRules: false,
            });

            // Transactions and budgets still re-point to the target.
            expect(mockPrismaService.transaction.updateMany).toHaveBeenCalledWith({
                where: { categoryId: "category-id", userId: "test-user" },
                data: { categoryId: "target-id" },
            });
            expect(mockPrismaService.budget.updateMany).toHaveBeenCalledWith({
                where: { categoryId: "category-id", userId: "test-user" },
                data: { categoryId: "target-id" },
            });

            // Mapping rules are dropped, not moved.
            expect(mockPrismaService.categoryMappingRule.deleteMany).toHaveBeenCalledWith({
                where: { categoryId: "category-id", userId: "test-user" },
            });
            expect(mockPrismaService.categoryMappingRule.updateMany).not.toHaveBeenCalled();
        });

        it("should throw BadRequestException when transferring a category to itself", async () => {
            mockPrismaService.category.findFirst.mockResolvedValue(mockCategory);

            await expect(
                service.remove("category-id", "test-user", { transferToCategoryId: "category-id" }),
            ).rejects.toThrow(BadRequestException);
        });

        it("should throw NotFoundException when the transfer target is invalid or foreign", async () => {
            // Source resolves, target does not.
            mockPrismaService.category.findFirst.mockResolvedValueOnce(mockCategory).mockResolvedValueOnce(null);

            await expect(
                service.remove("category-id", "test-user", { transferToCategoryId: "target-id" }),
            ).rejects.toThrow(NotFoundException);
        });

        it("should throw ForbiddenException when trying to delete system category", async () => {
            mockPrismaService.category.findFirst.mockResolvedValue(mockSystemCategory);

            await expect(service.remove("system-category-id", "test-user")).rejects.toThrow(ForbiddenException);
        });
    });

    describe("getUsageCount", () => {
        it("should return per-source counts and a total including mapping rules", async () => {
            mockPrismaService.category.findFirst.mockResolvedValue(mockCategory);
            mockPrismaService.transaction.count.mockResolvedValue(3);
            mockPrismaService.budget.count.mockResolvedValue(2);
            mockPrismaService.categoryMappingRule.count.mockResolvedValue(4);

            const result = await service.getUsageCount("category-id", "test-user");

            expect(result).toEqual({
                transactionCount: 3,
                budgetCount: 2,
                mappingRuleCount: 4,
                totalCount: 9,
            });

            // Budget usage must include both the legacy scalar link and the join-table link.
            expect(mockPrismaService.budget.count).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: expect.objectContaining({
                        OR: expect.arrayContaining([
                            { categoryId: "category-id" },
                            { budgetCategories: { some: { categoryId: "category-id" } } },
                        ]),
                    }),
                }),
            );
        });
    });
});
