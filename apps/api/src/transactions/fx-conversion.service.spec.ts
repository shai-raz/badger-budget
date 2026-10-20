import { FxConversionService } from "./fx-conversion.service";

describe("FxConversionService", () => {
    const mockPrismaService = {
        transaction: {
            findMany: jest.fn(),
        },
        budget: {
            findMany: jest.fn(),
        },
        fxRateDaily: {
            findUnique: jest.fn(),
            upsert: jest.fn(),
        },
        transactionConversion: {
            upsert: jest.fn(),
            findMany: jest.fn(),
        },
        currency: {
            findUnique: jest.fn(),
        },
    } as any;

    let service: FxConversionService;
    const originalApiKey = process.env.FREE_CURRENCY_API_KEY;

    beforeEach(() => {
        service = new FxConversionService(mockPrismaService as any);
        jest.clearAllMocks();
    });

    afterAll(() => {
        process.env.FREE_CURRENCY_API_KEY = originalApiKey;
    });

    it("uses cached daily rate when present and persists snapshot", async () => {
        (mockPrismaService.fxRateDaily.findUnique as jest.Mock).mockResolvedValue({
            rate: 1.11,
            provider: "freecurrencyapi",
            providerMetadata: { date: "2025-03-01" },
        });

        const result = await service.snapshotTransactionConversion({
            transactionId: "txn-1",
            sourceCurrencyId: "usd-id",
            targetCurrencyId: "eur-id",
            amount: 100,
            transactionDate: new Date("2025-03-01T10:30:00.000Z"),
        });

        expect(result).toEqual(
            expect.objectContaining({
                convertedAmount: 111,
                conversionRate: 1.11,
                source: "cache",
            }),
        );
        expect(mockPrismaService.transactionConversion.upsert).toHaveBeenCalledWith(
            expect.objectContaining({
                create: expect.objectContaining({
                    conversionRate: 1.11,
                    convertedAmount: 111,
                    providerMetadata: expect.objectContaining({ source: "cache" }),
                }),
            }),
        );
    });

    it("fetches provider rate when cache missing and stores both cache and snapshot", async () => {
        process.env.FREE_CURRENCY_API_KEY = "api-key";
        (mockPrismaService.fxRateDaily.findUnique as jest.Mock).mockResolvedValue(null);
        (mockPrismaService.currency.findUnique as jest.Mock)
            .mockResolvedValueOnce({ id: "usd-id", code: "USD" })
            .mockResolvedValueOnce({ id: "eur-id", code: "EUR" });

        (global as any).fetch = jest.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                data: {
                    "2025-03-01": {
                        EUR: 0.9,
                    },
                },
            }),
        } as never);

        const result = await service.snapshotTransactionConversion({
            transactionId: "txn-2",
            sourceCurrencyId: "usd-id",
            targetCurrencyId: "eur-id",
            amount: 100,
            transactionDate: new Date("2025-03-01T15:00:00.000Z"),
        });

        expect(result).toEqual(
            expect.objectContaining({
                convertedAmount: 90,
                conversionRate: 0.9,
                source: "provider",
                provider: "freecurrencyapi",
            }),
        );
        expect(mockPrismaService.fxRateDaily.upsert).toHaveBeenCalled();
        expect(mockPrismaService.transactionConversion.upsert).toHaveBeenCalledWith(
            expect.objectContaining({
                create: expect.objectContaining({
                    rateDate: new Date("2025-03-01T00:00:00.000Z"),
                    conversionRate: 0.9,
                    convertedAmount: 90,
                    provider: "freecurrencyapi",
                    providerMetadata: expect.objectContaining({ source: "provider" }),
                }),
            }),
        );
    });

    it("backfills missing snapshots in batches and retries failures", async () => {
        (mockPrismaService.transaction.findMany as jest.Mock)
            .mockResolvedValueOnce([
                {
                    id: "txn-1",
                    userId: "user-1",
                    currencyId: "usd-id",
                    amount: 10,
                    transactionDate: new Date("2025-03-01T00:00:00.000Z"),
                },
            ])
            .mockResolvedValueOnce([]);

        (mockPrismaService.budget.findMany as jest.Mock).mockResolvedValue([
            { userId: "user-1", currencyId: "eur-id" },
        ]);

        (mockPrismaService.transactionConversion.findMany as jest.Mock).mockResolvedValue([]);

        const snapshotSpy = jest
            .spyOn(service, "snapshotTransactionConversion")
            .mockRejectedValueOnce(new Error("temporary failure"))
            .mockResolvedValueOnce({
                convertedAmount: 9,
                conversionRate: 0.9,
                rateDate: new Date("2025-03-01T00:00:00.000Z"),
                source: "provider",
                provider: "freecurrencyapi",
            });

        const result = await service.backfillMissingSnapshots({
            batchSize: 1,
            maxRetries: 1,
            retryDelayMs: 1,
        });

        expect(result).toEqual({
            processedTransactions: 1,
            snapshotsAttempted: 1,
            snapshotsCreated: 1,
            snapshotsFailed: 0,
            batchesProcessed: 1,
        });
        expect(snapshotSpy).toHaveBeenCalledTimes(2);
    });
});
