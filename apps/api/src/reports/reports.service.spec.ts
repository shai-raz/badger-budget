import { Test, TestingModule } from "@nestjs/testing";
import { BadRequestException } from "@nestjs/common";
import { ReportsService } from "./reports.service";
import { PrismaService } from "../prisma/prisma.service";
import { FxConversionService } from "../transactions/fx-conversion.service";

describe("ReportsService", () => {
    let service: ReportsService;

    const mockPrismaService = {
        currency: {
            findUnique: jest.fn(),
        },
        transaction: {
            findMany: jest.fn(),
            findFirst: jest.fn(),
        },
        fxRateDaily: {
            findMany: jest.fn(),
        },
    };

    const mockFxConversionService = {
        getRate: jest.fn(),
    };

    const ilsCurrency = {
        id: "ils-id",
        code: "ILS",
        symbol: "₪",
        name: "Israeli New Shekel",
    };

    const groceries = {
        id: "cat-groceries",
        name: "Groceries",
        color: "#22c55e",
        icon: "pi pi-shopping-cart",
    };

    const rent = {
        id: "cat-rent",
        name: "Rent",
        color: "#3b82f6",
        icon: null,
    };

    const txn = (
        amount: number,
        category: {
            id: string;
            name: string;
            color: string;
            icon: string | null;
        } | null,
        overrides: Partial<{
            currencyId: string;
            transactionDate: Date;
            reimbursedBy: { amount: number }[];
        }> = {},
    ) => ({
        amount,
        currencyId: overrides.currencyId ?? ilsCurrency.id,
        transactionDate: overrides.transactionDate ?? new Date("2026-07-10"),
        categoryId: category?.id ?? null,
        category,
        reimbursedBy: overrides.reimbursedBy ?? [],
    });

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                ReportsService,
                { provide: PrismaService, useValue: mockPrismaService },
                { provide: FxConversionService, useValue: mockFxConversionService },
            ],
        }).compile();

        service = module.get<ReportsService>(ReportsService);
        mockPrismaService.currency.findUnique.mockResolvedValue(ilsCurrency);
        mockPrismaService.fxRateDaily.findMany.mockResolvedValue([]);
        mockPrismaService.transaction.findFirst.mockResolvedValue(null);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    const query = { startDate: "2026-07-01", endDate: "2026-07-31" };

    it("groups by category, computes percentages, and sorts by amount descending", async () => {
        mockPrismaService.transaction.findMany
            .mockResolvedValueOnce([txn(100, groceries), txn(300, rent), txn(100, groceries)])
            .mockResolvedValueOnce([]);

        const result = await service.getSpendingReport("user-id", query);

        expect(result.total).toBe(500);
        expect(result.transactionCount).toBe(3);
        expect(result.categories).toEqual([
            {
                categoryId: rent.id,
                name: "Rent",
                color: rent.color,
                icon: null,
                amount: 300,
                percentage: 60,
                transactionCount: 1,
            },
            {
                categoryId: groceries.id,
                name: "Groceries",
                color: groceries.color,
                icon: groceries.icon,
                amount: 200,
                percentage: 40,
                transactionCount: 2,
            },
        ]);
        expect(result.currency).toEqual({ code: "ILS", symbol: "₪" });
    });

    it("scopes the query to the user's expenses in the window", async () => {
        mockPrismaService.transaction.findMany.mockResolvedValue([]);

        await service.getSpendingReport("user-id", query);

        expect(mockPrismaService.transaction.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    userId: "user-id",
                    deletedAt: null,
                    hidden: false,
                    type: "expense",
                    transactionDate: {
                        gte: new Date("2026-07-01"),
                        lte: new Date("2026-07-31"),
                    },
                }),
            }),
        );
    });

    it("buckets uncategorized transactions under 'Uncategorized'", async () => {
        mockPrismaService.transaction.findMany
            .mockResolvedValueOnce([txn(50, null), txn(150, groceries)])
            .mockResolvedValueOnce([]);

        const result = await service.getSpendingReport("user-id", query);

        expect(result.categories[1]).toEqual({
            categoryId: null,
            name: "Uncategorized",
            color: "#9ca3af",
            icon: null,
            amount: 50,
            percentage: 25,
            transactionCount: 1,
        });
    });

    it("nets active income reimbursements out of the expense's category bucket", async () => {
        mockPrismaService.transaction.findMany
            .mockResolvedValueOnce([txn(600, groceries, { reimbursedBy: [{ amount: 250 }] }), txn(100, groceries)])
            .mockResolvedValueOnce([]);

        const result = await service.getSpendingReport("user-id", query);

        expect(result.total).toBe(450);
        expect(result.categories[0]).toEqual(expect.objectContaining({ amount: 450, transactionCount: 2 }));
    });

    it("counts a fully reimbursed expense as zero spent but still as a transaction", async () => {
        mockPrismaService.transaction.findMany
            .mockResolvedValueOnce([txn(200, groceries, { reimbursedBy: [{ amount: 200 }] })])
            .mockResolvedValueOnce([]);

        const result = await service.getSpendingReport("user-id", query);

        expect(result.total).toBe(0);
        expect(result.transactionCount).toBe(1);
    });

    it("converts foreign-currency amounts via the FX rate", async () => {
        mockPrismaService.transaction.findMany
            .mockResolvedValueOnce([
                txn(100, groceries),
                txn(10, groceries, { currencyId: "usd-id" }),
                txn(20, groceries, { currencyId: "usd-id" }),
            ])
            .mockResolvedValueOnce([]);
        mockFxConversionService.getRate.mockResolvedValue(3.5);

        const result = await service.getSpendingReport("user-id", query);

        expect(result.total).toBe(205);
        // Unique (currency, date) pairs are deduplicated before fetching.
        expect(mockFxConversionService.getRate).toHaveBeenCalledTimes(1);
        expect(mockFxConversionService.getRate).toHaveBeenCalledWith("usd-id", ilsCurrency.id, new Date("2026-07-10"));
    });

    it("preloads cached FX rates in one query and skips the provider", async () => {
        mockPrismaService.transaction.findMany
            .mockResolvedValueOnce([
                txn(10, groceries, { currencyId: "usd-id" }),
                txn(20, groceries, {
                    currencyId: "usd-id",
                    transactionDate: new Date("2026-07-11"),
                }),
            ])
            .mockResolvedValueOnce([]);
        mockPrismaService.fxRateDaily.findMany.mockResolvedValue([
            {
                baseCurrencyId: "usd-id",
                rateDate: new Date("2026-07-10"),
                rate: "3.5",
            },
            {
                baseCurrencyId: "usd-id",
                rateDate: new Date("2026-07-11"),
                rate: "4",
            },
        ]);

        const result = await service.getSpendingReport("user-id", query);

        expect(result.total).toBe(115);
        expect(mockPrismaService.fxRateDaily.findMany).toHaveBeenCalledTimes(1);
        expect(mockPrismaService.fxRateDaily.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    quoteCurrencyId: ilsCurrency.id,
                    OR: [
                        { baseCurrencyId: "usd-id", rateDate: new Date("2026-07-10") },
                        { baseCurrencyId: "usd-id", rateDate: new Date("2026-07-11") },
                    ],
                }),
            }),
        );
        expect(mockFxConversionService.getRate).not.toHaveBeenCalled();
    });

    it("fails the report when a rate cannot be resolved", async () => {
        mockPrismaService.transaction.findMany
            .mockResolvedValueOnce([txn(10, groceries, { currencyId: "usd-id" })])
            .mockResolvedValueOnce([]);
        mockFxConversionService.getRate.mockRejectedValue(new Error("provider unavailable"));

        await expect(service.getSpendingReport("user-id", query)).rejects.toThrow("provider unavailable");
    });

    it("computes the comparison against the previous equal-length period", async () => {
        mockPrismaService.transaction.findMany
            .mockResolvedValueOnce([txn(210, groceries)])
            .mockResolvedValueOnce([txn(200, groceries)]);

        const result = await service.getSpendingReport("user-id", query);

        expect(result.comparison).toEqual({
            startDate: "2026-06-01",
            endDate: "2026-06-30",
            total: 200,
            changePercentage: 5,
            direction: "up",
        });
    });

    it("compares a partial month against the same days of the previous month by default", async () => {
        mockPrismaService.transaction.findMany.mockResolvedValue([]);

        const result = await service.getSpendingReport("user-id", {
            startDate: "2026-10-01",
            endDate: "2026-10-26",
        });

        expect(result.comparison).toEqual(expect.objectContaining({ startDate: "2026-09-01", endDate: "2026-09-26" }));
        expect(mockPrismaService.transaction.findMany).toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({
                where: expect.objectContaining({
                    transactionDate: { gte: new Date("2026-09-01"), lte: new Date("2026-09-26") },
                }),
            }),
        );
    });

    it("compares against the same dates one year earlier with compare=yearOverYear", async () => {
        mockPrismaService.transaction.findMany.mockResolvedValue([]);

        const result = await service.getSpendingReport("user-id", {
            startDate: "2026-10-01",
            endDate: "2026-10-26",
            compare: "yearOverYear",
        });

        expect(result.comparison).toEqual(expect.objectContaining({ startDate: "2025-10-01", endDate: "2025-10-26" }));
        expect(mockPrismaService.transaction.findMany).toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({
                where: expect.objectContaining({
                    transactionDate: { gte: new Date("2025-10-01"), lte: new Date("2025-10-26") },
                }),
            }),
        );
    });

    it("reports direction 'down' when spending decreased", async () => {
        mockPrismaService.transaction.findMany
            .mockResolvedValueOnce([txn(90, groceries)])
            .mockResolvedValueOnce([txn(100, groceries)]);

        const result = await service.getSpendingReport("user-id", query);

        expect(result.comparison.changePercentage).toBe(-10);
        expect(result.comparison.direction).toBe("down");
    });

    it("returns a null changePercentage when the previous total is 0", async () => {
        mockPrismaService.transaction.findMany.mockResolvedValueOnce([txn(100, groceries)]).mockResolvedValueOnce([]);

        const result = await service.getSpendingReport("user-id", query);

        expect(result.comparison.total).toBe(0);
        expect(result.comparison.changePercentage).toBeNull();
        expect(result.comparison.direction).toBe("flat");
    });

    it("returns an empty report for a window with no spending", async () => {
        mockPrismaService.transaction.findMany.mockResolvedValue([]);

        const result = await service.getSpendingReport("user-id", query);

        expect(result.total).toBe(0);
        expect(result.transactionCount).toBe(0);
        expect(result.categories).toEqual([]);
    });

    it("rejects a window where endDate precedes startDate", async () => {
        await expect(
            service.getSpendingReport("user-id", {
                startDate: "2026-07-31",
                endDate: "2026-07-01",
            }),
        ).rejects.toThrow(BadRequestException);
        expect(mockPrismaService.transaction.findMany).not.toHaveBeenCalled();
    });

    it("rejects an unknown currency code", async () => {
        mockPrismaService.currency.findUnique.mockResolvedValue(null);

        await expect(service.getSpendingReport("user-id", { ...query, currency: "XXX" })).rejects.toThrow(
            BadRequestException,
        );
        expect(mockPrismaService.transaction.findMany).not.toHaveBeenCalled();
    });

    describe("getMonthlySpending", () => {
        it("buckets expenses by month and zero-fills empty months in ascending order", async () => {
            mockPrismaService.transaction.findMany.mockResolvedValue([
                txn(100, groceries, { transactionDate: new Date("2026-05-03") }),
                txn(50, rent, { transactionDate: new Date("2026-05-20") }),
                txn(10, groceries, { transactionDate: new Date("2026-07-01") }),
            ]);

            const result = await service.getMonthlySpending("user-id", {
                startMonth: "2026-05",
                endMonth: "2026-07",
            });

            expect(result).toEqual({
                startMonth: "2026-05",
                endMonth: "2026-07",
                currency: { code: "ILS", symbol: "₪" },
                months: [
                    { month: "2026-05", total: 150, transactionCount: 2 },
                    { month: "2026-06", total: 0, transactionCount: 0 },
                    { month: "2026-07", total: 10, transactionCount: 1 },
                ],
                firstMonth: null,
            });
        });

        it("scopes the query to the user's expenses across the whole month range", async () => {
            mockPrismaService.transaction.findMany.mockResolvedValue([]);

            await service.getMonthlySpending("user-id", { startMonth: "2026-02", endMonth: "2026-06" });

            expect(mockPrismaService.transaction.findMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: expect.objectContaining({
                        userId: "user-id",
                        deletedAt: null,
                        hidden: false,
                        type: "expense",
                        transactionDate: {
                            gte: new Date("2026-02-01"),
                            lte: new Date("2026-06-30"),
                        },
                    }),
                }),
            );
        });

        it("converts foreign-currency amounts and nets active reimbursements", async () => {
            mockPrismaService.transaction.findMany.mockResolvedValue([
                txn(600, groceries, {
                    transactionDate: new Date("2026-06-10"),
                    reimbursedBy: [{ amount: 250 }],
                }),
                txn(10, groceries, {
                    currencyId: "usd-id",
                    transactionDate: new Date("2026-06-10"),
                }),
            ]);
            mockFxConversionService.getRate.mockResolvedValue(3.5);

            const result = await service.getMonthlySpending("user-id", { startMonth: "2026-06", endMonth: "2026-06" });

            expect(result.months).toEqual([{ month: "2026-06", total: 385, transactionCount: 2 }]);
            expect(mockFxConversionService.getRate).toHaveBeenCalledWith(
                "usd-id",
                ilsCurrency.id,
                new Date("2026-06-10"),
            );
        });

        it("fails the whole call when a rate cannot be resolved", async () => {
            mockPrismaService.transaction.findMany.mockResolvedValue([
                txn(10, groceries, { currencyId: "usd-id", transactionDate: new Date("2026-06-10") }),
            ]);
            mockFxConversionService.getRate.mockRejectedValue(new Error("provider unavailable"));

            await expect(
                service.getMonthlySpending("user-id", { startMonth: "2026-06", endMonth: "2026-06" }),
            ).rejects.toThrow("provider unavailable");
        });

        it("returns firstMonth from the earliest counted expense of any date", async () => {
            mockPrismaService.transaction.findMany.mockResolvedValue([]);
            mockPrismaService.transaction.findFirst.mockResolvedValue({ transactionDate: new Date("2024-03-15") });

            const result = await service.getMonthlySpending("user-id", { startMonth: "2026-06", endMonth: "2026-06" });

            expect(result.firstMonth).toBe("2024-03");
            expect(mockPrismaService.transaction.findFirst).toHaveBeenCalledWith({
                where: { userId: "user-id", deletedAt: null, hidden: false, type: "expense" },
                orderBy: { transactionDate: "asc" },
                select: { transactionDate: true },
            });
        });

        it("returns a null firstMonth when the user has no counted expenses", async () => {
            mockPrismaService.transaction.findMany.mockResolvedValue([]);
            mockPrismaService.transaction.findFirst.mockResolvedValue(null);

            const result = await service.getMonthlySpending("user-id", { startMonth: "2026-06", endMonth: "2026-06" });

            expect(result.firstMonth).toBeNull();
        });

        it("rejects a range where endMonth precedes startMonth", async () => {
            await expect(
                service.getMonthlySpending("user-id", { startMonth: "2026-06", endMonth: "2026-05" }),
            ).rejects.toThrow(BadRequestException);
            expect(mockPrismaService.transaction.findMany).not.toHaveBeenCalled();
        });

        it("rejects a range longer than 60 months and accepts exactly 60", async () => {
            mockPrismaService.transaction.findMany.mockResolvedValue([]);

            await expect(
                service.getMonthlySpending("user-id", { startMonth: "2021-01", endMonth: "2026-01" }),
            ).rejects.toThrow(BadRequestException);
            expect(mockPrismaService.transaction.findMany).not.toHaveBeenCalled();

            const result = await service.getMonthlySpending("user-id", { startMonth: "2021-01", endMonth: "2025-12" });
            expect(result.months).toHaveLength(60);
        });

        it("rejects an unknown currency code", async () => {
            mockPrismaService.currency.findUnique.mockResolvedValue(null);

            await expect(
                service.getMonthlySpending("user-id", { startMonth: "2026-06", endMonth: "2026-06", currency: "XXX" }),
            ).rejects.toThrow(BadRequestException);
            expect(mockPrismaService.transaction.findMany).not.toHaveBeenCalled();
        });

        it("matches the spending report total for a single month with identical fixtures", async () => {
            const rows = [
                txn(100, groceries, { transactionDate: new Date("2026-06-10") }),
                txn(10, groceries, {
                    currencyId: "usd-id",
                    transactionDate: new Date("2026-06-15"),
                    reimbursedBy: [{ amount: 2 }],
                }),
            ];
            mockFxConversionService.getRate.mockResolvedValue(3.5);

            // getSpendingReport queries the current window, then the previous one.
            mockPrismaService.transaction.findMany.mockResolvedValueOnce(rows).mockResolvedValueOnce([]);
            const spending = await service.getSpendingReport("user-id", {
                startDate: "2026-06-01",
                endDate: "2026-06-30",
            });

            mockPrismaService.transaction.findMany.mockResolvedValueOnce(rows);
            const monthly = await service.getMonthlySpending("user-id", { startMonth: "2026-06", endMonth: "2026-06" });

            expect(monthly.months[0].total).toBe(spending.total);
            expect(monthly.months[0].transactionCount).toBe(spending.transactionCount);
            expect(monthly.months[0].total).toBe(128);
        });
    });
});
