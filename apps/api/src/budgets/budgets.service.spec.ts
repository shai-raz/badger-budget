import { Test, TestingModule } from "@nestjs/testing";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { BudgetsService } from "./budgets.service";
import { PrismaService } from "../prisma/prisma.service";

describe("BudgetsService", () => {
    let service: BudgetsService;
    let prisma: PrismaService;

    const mockPrismaService = {
        budget: {
            create: jest.fn(),
            findMany: jest.fn(),
            findFirst: jest.fn(),
            update: jest.fn(),
        },
        transaction: {
            findMany: jest.fn(),
        },
        category: {
            count: jest.fn(),
        },
    };

    const mockBudget = {
        id: "budget-id",
        userId: "test-user",
        name: "Monthly Budget",
        amount: 1000,
        currencyId: "currency-id",
        period: "monthly",
        startDate: new Date("2025-01-01"),
        endDate: null,
        categoryId: null,
        accountId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        currency: {
            id: "currency-id",
            code: "USD",
            name: "US Dollar",
            symbol: "$",
        },
        budgetCategories: [],
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                BudgetsService,
                {
                    provide: PrismaService,
                    useValue: mockPrismaService,
                },
            ],
        }).compile();

        service = module.get<BudgetsService>(BudgetsService);
        prisma = module.get<PrismaService>(PrismaService);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe("create", () => {
        it("should create a budget with date conversion", async () => {
            const createDto = {
                name: "Monthly Budget",
                amount: 1000,
                currencyId: "currency-id",
                period: "monthly",
                categoryIds: ["category-id"],
                startDate: "2025-01-01",
                endDate: "2025-01-31",
            };

            mockPrismaService.budget.create.mockResolvedValue(mockBudget);
            mockPrismaService.category.count.mockResolvedValue(1);

            const result = await service.create("test-user", createDto);

            expect(result).toEqual(mockBudget);
            expect(mockPrismaService.budget.create).toHaveBeenCalledWith({
                data: {
                    name: createDto.name,
                    amount: createDto.amount,
                    currencyId: createDto.currencyId,
                    period: createDto.period,
                    categoryId: createDto.categoryIds[0],
                    startDate: new Date(createDto.startDate),
                    endDate: new Date(createDto.endDate),
                    userId: "test-user",
                    budgetCategories: {
                        createMany: {
                            data: [{ categoryId: "category-id" }],
                        },
                    },
                },
                include: expect.objectContaining({
                    currency: true,
                    account: true,
                    budgetCategories: expect.any(Object),
                }),
            });
        });

        it("should create a budget with optional category and account", async () => {
            const createDto = {
                name: "Food Budget",
                amount: 500,
                currencyId: "currency-id",
                period: "monthly",
                categoryIds: ["category-id"],
                startDate: "2025-01-01",
                endDate: "2025-01-31",
                categoryId: "category-id",
                accountId: "account-id",
            };

            mockPrismaService.budget.create.mockResolvedValue({
                ...mockBudget,
                categoryId: "category-id",
                accountId: "account-id",
            });
            mockPrismaService.category.count.mockResolvedValue(1);

            const result = await service.create("test-user", createDto);

            expect(mockPrismaService.budget.create).toHaveBeenCalledWith({
                data: expect.objectContaining({
                    categoryId: "category-id",
                    accountId: "account-id",
                }),
                include: expect.any(Object),
            });
        });

        it("should fallback to legacy categoryId when categoryIds is omitted", async () => {
            const createDto = {
                name: "Legacy Budget",
                amount: 300,
                currencyId: "currency-id",
                period: "monthly",
                categoryId: "legacy-category-id",
                startDate: "2025-01-01",
            };

            mockPrismaService.category.count.mockResolvedValue(1);
            mockPrismaService.budget.create.mockResolvedValue(mockBudget);

            await service.create("test-user", createDto as any);

            expect(mockPrismaService.budget.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        categoryId: "legacy-category-id",
                        budgetCategories: {
                            createMany: {
                                data: [{ categoryId: "legacy-category-id" }],
                            },
                        },
                    }),
                }),
            );
        });

        it("should throw when category does not belong to user", async () => {
            mockPrismaService.category.count.mockResolvedValue(0);

            await expect(
                service.create("test-user", {
                    name: "Invalid",
                    amount: 100,
                    currencyId: "currency-id",
                    period: "monthly",
                    categoryIds: ["not-owned-category-id"],
                    startDate: "2025-01-01",
                } as any),
            ).rejects.toThrow(BadRequestException);
        });

        it("should require at least one category when creating a budget", async () => {
            await expect(
                service.create("test-user", {
                    name: "No Categories",
                    amount: 100,
                    currencyId: "currency-id",
                    period: "monthly",
                    startDate: "2025-01-01",
                } as any),
            ).rejects.toThrow("At least one category ID is required");
            expect(mockPrismaService.budget.create).not.toHaveBeenCalled();
        });
    });

    describe("findAll", () => {
        it("should return all budgets for a user", async () => {
            mockPrismaService.budget.findMany.mockResolvedValue([mockBudget]);

            const result = await service.findAll("test-user");

            expect(result).toEqual([
                {
                    ...mockBudget,
                    categories: [],
                    currencyDisplay: { code: "USD", symbol: "$" },
                },
            ]);
            expect(mockPrismaService.budget.findMany).toHaveBeenCalledWith({
                where: {
                    userId: "test-user",
                    deletedAt: null,
                },
                include: expect.objectContaining({
                    currency: true,
                    account: true,
                    budgetCategories: expect.any(Object),
                }),
                orderBy: { createdAt: "desc" },
            });
        });
    });

    describe("findOne", () => {
        it("should return a budget by id", async () => {
            mockPrismaService.budget.findFirst.mockResolvedValue(mockBudget);

            const result = await service.findOne("budget-id", "test-user");

            expect(result).toEqual({
                ...mockBudget,
                categories: [],
                currencyDisplay: { code: "USD", symbol: "$" },
            });
            expect(mockPrismaService.budget.findFirst).toHaveBeenCalledWith({
                where: {
                    id: "budget-id",
                    userId: "test-user",
                    deletedAt: null,
                },
                include: {
                    currency: true,
                    account: true,
                    budgetCategories: expect.any(Object),
                    transactions: {
                        where: { deletedAt: null },
                    },
                },
            });
        });

        it("should throw NotFoundException if budget not found", async () => {
            mockPrismaService.budget.findFirst.mockResolvedValue(null);

            await expect(service.findOne("non-existent", "test-user")).rejects.toThrow(NotFoundException);
        });
    });

    describe("update", () => {
        it("should update a budget", async () => {
            const updateDto = {
                name: "Updated Budget",
                amount: 1500,
            };

            mockPrismaService.budget.findFirst.mockResolvedValue(mockBudget);
            mockPrismaService.budget.update.mockResolvedValue({
                ...mockBudget,
                ...updateDto,
            });

            const result = await service.update("budget-id", "test-user", updateDto);

            expect(result.name).toBe("Updated Budget");
            expect(result.amount).toBe(1500);
            expect(mockPrismaService.budget.update).toHaveBeenCalledWith({
                where: { id: "budget-id" },
                data: updateDto,
                include: expect.any(Object),
            });
        });

        it("should update with date conversion", async () => {
            const updateDto = {
                startDate: "2025-02-01",
                endDate: "2025-02-28",
            };

            mockPrismaService.budget.findFirst.mockResolvedValue(mockBudget);
            mockPrismaService.budget.update.mockResolvedValue(mockBudget);
            mockPrismaService.category.count.mockResolvedValue(2);

            await service.update("budget-id", "test-user", {
                ...updateDto,
                categoryIds: ["cat-1", "cat-2"],
            });

            expect(mockPrismaService.budget.update).toHaveBeenCalledWith({
                where: { id: "budget-id" },
                data: {
                    startDate: new Date("2025-02-01"),
                    endDate: new Date("2025-02-28"),
                    categoryId: "cat-1",
                    budgetCategories: {
                        deleteMany: {},
                        createMany: {
                            data: [{ categoryId: "cat-1" }, { categoryId: "cat-2" }],
                        },
                    },
                },
                include: expect.any(Object),
            });
        });

        it("should require at least one category when category payload is provided on update", async () => {
            mockPrismaService.budget.findFirst.mockResolvedValue(mockBudget);

            await expect(
                service.update("budget-id", "test-user", {
                    categoryIds: [],
                } as any),
            ).rejects.toThrow("At least one category ID is required");

            expect(mockPrismaService.budget.update).not.toHaveBeenCalled();
        });
    });

    describe("remove", () => {
        it("should soft delete a budget", async () => {
            mockPrismaService.budget.findFirst.mockResolvedValue(mockBudget);
            mockPrismaService.budget.update.mockResolvedValue({
                ...mockBudget,
                deletedAt: new Date(),
            });

            const result = await service.remove("budget-id", "test-user");

            expect(result.deletedAt).toBeTruthy();
            expect(mockPrismaService.budget.update).toHaveBeenCalledWith({
                where: { id: "budget-id" },
                data: { deletedAt: expect.any(Date) },
            });
        });
    });

    describe("getAnalytics", () => {
        beforeEach(() => {
            jest.useFakeTimers().setSystemTime(new Date("2026-01-15T12:00:00.000Z"));
        });

        afterEach(() => {
            jest.useRealTimers();
        });

        it("should calculate analytics for a monthly budget", async () => {
            const budget = {
                ...mockBudget,
                period: "monthly",
                startDate: new Date("2025-01-01"),
                amount: 1000,
                categoryId: "category-id",
            };

            const mockTransactions = [
                { amount: 200, type: "expense", currencyId: "currency-id" },
                { amount: 150, type: "expense", currencyId: "currency-id" },
                { amount: 100, type: "expense", currencyId: "currency-id" },
            ];

            mockPrismaService.budget.findFirst.mockResolvedValue(budget);
            mockPrismaService.transaction.findMany.mockResolvedValue(mockTransactions);

            const result = await service.getAnalytics("budget-id", "test-user");

            expect(result.budgetId).toBe("budget-id");
            expect(result.budgetName).toBe("Monthly Budget");
            expect(result.amount).toBe(1000);
            expect(result.totalSpent).toBe(450);
            expect(result.remaining).toBe(550);
            expect(result.percentageUsed).toBe(45);
            expect(result.transactionCount).toBe(3);
            expect(result.isOverBudget).toBe(false);
            expect(result.currencyDisplay).toEqual({ code: "USD", symbol: "$" });
            expect(result.categories).toEqual([]);
        });

        it("should detect over-budget status", async () => {
            const budget = {
                ...mockBudget,
                period: "monthly",
                amount: 500,
            };

            const mockTransactions = [
                { amount: 300, type: "expense", currencyId: "currency-id" },
                { amount: 250, type: "expense", currencyId: "currency-id" },
            ];

            mockPrismaService.budget.findFirst.mockResolvedValue(budget);
            mockPrismaService.transaction.findMany.mockResolvedValue(mockTransactions);

            const result = await service.getAnalytics("budget-id", "test-user");

            expect(result.totalSpent).toBe(550);
            expect(result.remaining).toBe(-50);
            expect(result.percentageUsed).toBe(110);
            expect(result.isOverBudget).toBe(true);
        });

        it("should filter transactions by budget category set and not budgetId", async () => {
            const budget = {
                ...mockBudget,
                period: "monthly",
                categoryId: null,
                budgetCategories: [
                    { categoryId: "category-1", category: { id: "category-1" } },
                    { categoryId: "category-2", category: { id: "category-2" } },
                ],
            };

            mockPrismaService.budget.findFirst.mockResolvedValue(budget);
            mockPrismaService.transaction.findMany.mockResolvedValue([]);

            await service.getAnalytics("budget-id", "test-user");

            expect(mockPrismaService.transaction.findMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: expect.objectContaining({
                        categoryId: {
                            in: ["category-1", "category-2"],
                        },
                        type: "expense",
                    }),
                }),
            );
        });

        it("should use timezone and locale options when querying period transactions", async () => {
            const budget = {
                ...mockBudget,
                period: "weekly",
            };

            mockPrismaService.budget.findFirst.mockResolvedValue(budget);
            mockPrismaService.transaction.findMany.mockResolvedValue([]);

            await service.getAnalytics("budget-id", "test-user", {
                timeZone: "UTC",
                locale: "en-GB",
            });

            expect(mockPrismaService.transaction.findMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: expect.objectContaining({
                        transactionDate: expect.objectContaining({
                            gte: expect.any(Date),
                            lte: expect.any(Date),
                        }),
                    }),
                }),
            );
        });

        it("should produce stable weekly timezone/locale period boundaries", async () => {
            const budget = {
                ...mockBudget,
                period: "weekly",
            };

            mockPrismaService.budget.findFirst.mockResolvedValue(budget);
            mockPrismaService.transaction.findMany.mockResolvedValue([]);

            await service.getAnalytics("budget-id", "test-user", {
                timeZone: "America/Los_Angeles",
                locale: "en-US",
            });

            const analyticsQuery = mockPrismaService.transaction.findMany.mock.calls[0][0];
            expect(analyticsQuery.where.transactionDate.gte.toISOString()).toBe("2026-01-11T08:00:00.000Z");
            expect(analyticsQuery.where.transactionDate.lte.toISOString()).toBe("2026-01-18T07:59:59.999Z");
        });

        it("excludes hidden expenses from the period spend query", async () => {
            mockPrismaService.budget.findFirst.mockResolvedValue({ ...mockBudget, period: "monthly" });
            mockPrismaService.transaction.findMany.mockResolvedValue([]);

            await service.getAnalytics("budget-id", "test-user");

            expect(mockPrismaService.transaction.findMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: expect.objectContaining({
                        type: "expense",
                        hidden: false,
                    }),
                }),
            );
        });

        it("should use FX conversion snapshot amount for cross-currency spend", async () => {
            const budget = {
                ...mockBudget,
                currencyId: "usd",
            };

            mockPrismaService.budget.findFirst.mockResolvedValue(budget);
            mockPrismaService.transaction.findMany.mockResolvedValue([
                {
                    amount: 100,
                    type: "expense",
                    currencyId: "eur",
                    conversions: [{ convertedAmount: 125.5 }],
                },
            ]);

            const result = await service.getAnalytics("budget-id", "test-user");

            expect(result.totalSpent).toBe(125.5);
            expect(mockPrismaService.transaction.findMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    include: {
                        conversions: {
                            where: { targetCurrencyId: "usd" },
                            take: 1,
                        },
                    },
                }),
            );
        });

        it("should not count cross-currency transactions without conversion snapshots", async () => {
            const budget = {
                ...mockBudget,
                currencyId: "usd",
            };

            mockPrismaService.budget.findFirst.mockResolvedValue(budget);
            mockPrismaService.transaction.findMany.mockResolvedValue([
                {
                    amount: 200,
                    type: "expense",
                    currencyId: "eur",
                    conversions: [],
                },
            ]);

            const result = await service.getAnalytics("budget-id", "test-user");

            expect(result.totalSpent).toBe(0);
        });

        it("should calculate weekly budget period correctly", async () => {
            const budget = {
                ...mockBudget,
                period: "weekly",
                startDate: new Date("2025-01-01"),
            };

            mockPrismaService.budget.findFirst.mockResolvedValue(budget);
            mockPrismaService.transaction.findMany.mockResolvedValue([]);

            const result = await service.getAnalytics("budget-id", "test-user");

            expect(result.period).toBe("weekly");
            expect(result.periodStart).toBeDefined();
            expect(result.periodEnd).toBeDefined();
        });
    });

    describe("getDashboard", () => {
        beforeEach(() => {
            jest.useFakeTimers().setSystemTime(new Date("2026-01-15T12:00:00.000Z"));
        });

        afterEach(() => {
            jest.useRealTimers();
        });

        it("should return dashboard with all active budgets and analytics", async () => {
            const budgets = [
                {
                    ...mockBudget,
                    id: "budget-1",
                    name: "Groceries",
                    amount: 500,
                    period: "monthly",
                    endDate: null,
                },
                {
                    ...mockBudget,
                    id: "budget-2",
                    name: "Entertainment",
                    amount: 200,
                    period: "monthly",
                    endDate: null,
                },
            ];

            mockPrismaService.budget.findMany.mockResolvedValue(budgets);
            mockPrismaService.transaction.findMany
                .mockResolvedValueOnce([{ amount: 300, type: "expense", currencyId: "currency-id" }]) // For budget-1
                .mockResolvedValueOnce([{ amount: 150, type: "expense", currencyId: "currency-id" }]); // For budget-2

            const result = await service.getDashboard("test-user");

            expect(result.budgets).toHaveLength(2);
            expect(result.totalBudgets).toBe(2);
            expect(result.budgets[0].budgetName).toBe("Entertainment"); // 75% used, sorted first
            expect(result.budgets[1].budgetName).toBe("Groceries"); // 60% used
            expect(result.overBudgetCount).toBe(0);
            expect(result.budgets[0].categories).toEqual([]);
            expect(result.budgets[0].currencyDisplay).toEqual({
                code: "USD",
                symbol: "$",
            });
        });

        it("should filter out budgets with past end dates", async () => {
            const now = new Date();
            const pastDate = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000); // 10 days ago
            const futureDate = new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000); // 10 days from now

            const budgets = [
                {
                    ...mockBudget,
                    id: "budget-1",
                    name: "Active Budget",
                    period: "monthly",
                    endDate: null,
                },
                {
                    ...mockBudget,
                    id: "budget-2",
                    name: "Future Budget",
                    period: "monthly",
                    endDate: futureDate,
                },
                {
                    ...mockBudget,
                    id: "budget-3",
                    name: "Expired Budget",
                    period: "monthly",
                    endDate: pastDate,
                },
            ];

            mockPrismaService.budget.findMany.mockResolvedValue(budgets);
            mockPrismaService.transaction.findMany.mockResolvedValue([]);

            const result = await service.getDashboard("test-user");

            expect(result.budgets).toHaveLength(2);
            expect(result.budgets.map((b) => b.budgetName)).not.toContain("Expired Budget");
        });

        it("should count over-budget items correctly", async () => {
            const budgets = [
                {
                    ...mockBudget,
                    id: "budget-1",
                    amount: 100,
                    period: "monthly",
                    endDate: null,
                },
                {
                    ...mockBudget,
                    id: "budget-2",
                    amount: 200,
                    period: "monthly",
                    endDate: null,
                },
            ];

            mockPrismaService.budget.findMany.mockResolvedValue(budgets);
            mockPrismaService.transaction.findMany
                .mockResolvedValueOnce([{ amount: 150, type: "expense", currencyId: "currency-id" }]) // Over budget
                .mockResolvedValueOnce([{ amount: 50, type: "expense", currencyId: "currency-id" }]); // Under budget

            const result = await service.getDashboard("test-user");

            expect(result.overBudgetCount).toBe(1);
        });

        it("should reuse period utility for dashboard analytics across all budgets", async () => {
            const budgets = [
                {
                    ...mockBudget,
                    id: "budget-weekly",
                    period: "weekly",
                    endDate: null,
                },
            ];

            mockPrismaService.budget.findMany.mockResolvedValue(budgets);
            mockPrismaService.transaction.findMany.mockResolvedValue([]);

            await service.getDashboard("test-user", {
                timeZone: "UTC",
                locale: "en-US",
            });

            expect(mockPrismaService.transaction.findMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: expect.objectContaining({
                        transactionDate: expect.objectContaining({
                            gte: expect.any(Date),
                            lte: expect.any(Date),
                        }),
                    }),
                }),
            );
        });

        it("should sort budgets by percentage used descending", async () => {
            const budgets = [
                {
                    ...mockBudget,
                    id: "budget-1",
                    name: "Low",
                    amount: 1000,
                    period: "monthly",
                    endDate: null,
                },
                {
                    ...mockBudget,
                    id: "budget-2",
                    name: "High",
                    amount: 100,
                    period: "monthly",
                    endDate: null,
                },
                {
                    ...mockBudget,
                    id: "budget-3",
                    name: "Medium",
                    amount: 500,
                    period: "monthly",
                    endDate: null,
                },
            ];

            mockPrismaService.budget.findMany.mockResolvedValue(budgets);
            mockPrismaService.transaction.findMany
                .mockResolvedValueOnce([{ amount: 100, type: "expense", currencyId: "currency-id" }]) // 10%
                .mockResolvedValueOnce([{ amount: 90, type: "expense", currencyId: "currency-id" }]) // 90%
                .mockResolvedValueOnce([{ amount: 250, type: "expense", currencyId: "currency-id" }]); // 50%

            const result = await service.getDashboard("test-user");

            expect(result.budgets[0].budgetName).toBe("High"); // 90%
            expect(result.budgets[1].budgetName).toBe("Medium"); // 50%
            expect(result.budgets[2].budgetName).toBe("Low"); // 10%
        });

        it("should allow category overlap across budgets", async () => {
            const budgets = [
                {
                    ...mockBudget,
                    id: "budget-a",
                    name: "Budget A",
                    amount: 500,
                    period: "monthly",
                    endDate: null,
                    budgetCategories: [{ categoryId: "shared-category", category: { id: "shared-category" } }],
                },
                {
                    ...mockBudget,
                    id: "budget-b",
                    name: "Budget B",
                    amount: 300,
                    period: "monthly",
                    endDate: null,
                    budgetCategories: [{ categoryId: "shared-category", category: { id: "shared-category" } }],
                },
            ];

            const sharedTransactions = [
                { amount: 100, type: "expense", currencyId: "currency-id", categoryId: "shared-category" },
            ];

            mockPrismaService.budget.findMany.mockResolvedValue(budgets);
            mockPrismaService.transaction.findMany
                .mockResolvedValueOnce(sharedTransactions)
                .mockResolvedValueOnce(sharedTransactions);

            const result = await service.getDashboard("test-user");

            expect(result.budgets).toHaveLength(2);
            expect(result.budgets.find((b) => b.budgetId === "budget-a")?.totalSpent).toBe(100);
            expect(result.budgets.find((b) => b.budgetId === "budget-b")?.totalSpent).toBe(100);
            expect(mockPrismaService.transaction.findMany).toHaveBeenNthCalledWith(
                1,
                expect.objectContaining({
                    where: expect.objectContaining({
                        categoryId: {
                            in: ["shared-category"],
                        },
                        type: "expense",
                    }),
                }),
            );
            expect(mockPrismaService.transaction.findMany).toHaveBeenNthCalledWith(
                2,
                expect.objectContaining({
                    where: expect.objectContaining({
                        categoryId: {
                            in: ["shared-category"],
                        },
                        type: "expense",
                    }),
                }),
            );
        });

        it("should keep expense-only filtering in dashboard queries", async () => {
            const budgets = [
                {
                    ...mockBudget,
                    id: "budget-1",
                    amount: 400,
                    period: "monthly",
                    endDate: null,
                    budgetCategories: [{ categoryId: "cat-1", category: { id: "cat-1" } }],
                },
            ];

            mockPrismaService.budget.findMany.mockResolvedValue(budgets);
            mockPrismaService.transaction.findMany.mockResolvedValue([]);

            await service.getDashboard("test-user");

            expect(mockPrismaService.transaction.findMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: expect.objectContaining({
                        type: "expense",
                        categoryId: { in: ["cat-1"] },
                    }),
                }),
            );
        });

        it("should use FX conversion snapshot amount in dashboard analytics", async () => {
            const budgets = [
                {
                    ...mockBudget,
                    id: "budget-1",
                    amount: 500,
                    period: "monthly",
                    endDate: null,
                    currencyId: "usd",
                },
            ];

            mockPrismaService.budget.findMany.mockResolvedValue(budgets);
            mockPrismaService.transaction.findMany.mockResolvedValue([
                {
                    amount: 50,
                    type: "expense",
                    currencyId: "eur",
                    conversions: [{ convertedAmount: 75 }],
                },
            ]);

            const result = await service.getDashboard("test-user");

            expect(result.budgets[0].totalSpent).toBe(75);
            expect(mockPrismaService.transaction.findMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    include: {
                        conversions: {
                            where: { targetCurrencyId: "usd" },
                            take: 1,
                        },
                    },
                }),
            );
        });
    });

    describe("past-period navigation", () => {
        beforeEach(() => {
            jest.useFakeTimers().setSystemTime(new Date("2026-01-15T12:00:00.000Z"));
        });

        afterEach(() => {
            jest.useRealTimers();
        });

        it("getAnalytics queries the previous period window when periodOffset is -1", async () => {
            const budget = {
                ...mockBudget,
                period: "monthly",
                startDate: new Date("2025-01-01"),
                endDate: null,
                categoryId: "category-id",
            };

            mockPrismaService.budget.findFirst.mockResolvedValue(budget);
            mockPrismaService.transaction.findMany.mockResolvedValue([]);

            const result = await service.getAnalytics("budget-id", "test-user", {
                periodOffset: -1,
            });

            expect(result.existsInPeriod).toBe(true);
            const query = mockPrismaService.transaction.findMany.mock.calls[0][0];
            expect(query.where.transactionDate.gte.toISOString()).toBe("2025-12-01T00:00:00.000Z");
            expect(query.where.transactionDate.lte.toISOString()).toBe("2025-12-31T23:59:59.999Z");
        });

        it("returns an empty-state entry (no txn query) when the window precedes the budget start", async () => {
            const budget = {
                ...mockBudget,
                period: "monthly",
                startDate: new Date("2026-02-01"), // starts after the viewed window
                endDate: null,
            };

            mockPrismaService.budget.findFirst.mockResolvedValue(budget);

            const result = await service.getAnalytics("budget-id", "test-user");

            expect(result.existsInPeriod).toBe(false);
            expect(result.totalSpent).toBe(0);
            expect(result.remaining).toBe(Number(budget.amount));
            expect(result.percentageUsed).toBe(0);
            expect(result.transactionCount).toBe(0);
            expect(mockPrismaService.transaction.findMany).not.toHaveBeenCalled();
        });

        it("section mode returns all budgets of the type (including ended) plus the section window", async () => {
            const budgets = [
                {
                    ...mockBudget,
                    id: "active",
                    name: "Active",
                    period: "monthly",
                    startDate: new Date("2025-01-01"),
                    endDate: null,
                },
                {
                    ...mockBudget,
                    id: "ended",
                    name: "Ended",
                    period: "monthly",
                    startDate: new Date("2025-01-01"),
                    endDate: new Date("2025-06-30"), // ended before the viewed window
                },
            ];

            mockPrismaService.budget.findMany.mockResolvedValue(budgets);
            mockPrismaService.transaction.findMany.mockResolvedValue([]);

            const result = await service.getDashboard("test-user", {
                period: "monthly",
                periodOffset: -1,
            });

            // Section mode filters by period at the DB layer and does NOT drop ended budgets.
            expect(mockPrismaService.budget.findMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: expect.objectContaining({ period: "monthly" }),
                }),
            );
            expect(result.budgets).toHaveLength(2);

            const ended = result.budgets.find((b) => b.budgetId === "ended");
            const active = result.budgets.find((b) => b.budgetId === "active");
            expect(ended.existsInPeriod).toBe(false);
            expect(active.existsInPeriod).toBe(true);
            // Empty-state budgets sort last.
            expect(result.budgets[result.budgets.length - 1].budgetId).toBe("ended");

            // Section-level cursor + window exposed for the UI label.
            expect(result.period).toBe("monthly");
            expect(result.periodOffset).toBe(-1);
            expect(result.periodStart.toISOString()).toBe("2025-12-01T00:00:00.000Z");
            expect(result.periodEnd.toISOString()).toBe("2025-12-31T23:59:59.999Z");
            // Only the active budget triggers a transaction query.
            expect(mockPrismaService.transaction.findMany).toHaveBeenCalledTimes(1);
        });
    });
});
