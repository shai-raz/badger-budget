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
});
