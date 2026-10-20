import { Logger } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { TransactionImportService, ImportCandidate } from "./transaction-import.service";
import { PrismaService } from "../prisma/prisma.service";
import { CardPayoffPatternsService } from "../card-payoff-patterns/card-payoff-patterns.service";

// Mocked to isolate the unit under test.
// The rule matcher is irrelevant here — candidates carry no originalCategory.
jest.mock("@badger/utils", () => ({
    findMatchingCategoryId: jest.fn().mockReturnValue(null),
}));

describe("TransactionImportService", () => {
    let service: TransactionImportService;

    const mockPrismaService = {
        transaction: {
            findMany: jest.fn(),
            findFirst: jest.fn(),
            createMany: jest.fn(),
            groupBy: jest.fn(),
            update: jest.fn(),
            updateMany: jest.fn(),
        },
        category: {
            findMany: jest.fn(),
            create: jest.fn(),
        },
        account: {
            findMany: jest.fn(),
            create: jest.fn(),
        },
        currency: {
            findMany: jest.fn(),
        },
        categoryMappingRule: {
            findMany: jest.fn(),
        },
    };

    const mockCardPayoffPatternsService = {
        checkDescription: jest.fn(),
    };

    const makeCandidate = (overrides: Partial<ImportCandidate>): ImportCandidate => ({
        externalId: "ext-1",
        accountNumber: "1234",
        transactionDate: new Date("2026-06-15"),
        postedDate: null,
        amount: 100,
        signedAmount: -100,
        chargedCurrencyCode: "ILS",
        originalAmount: null,
        originalCurrencyCode: null,
        description: "Some description",
        additionalDescription: null,
        originalCategory: null,
        paymentType: null,
        ...overrides,
    });

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                TransactionImportService,
                { provide: PrismaService, useValue: mockPrismaService },
                { provide: CardPayoffPatternsService, useValue: mockCardPayoffPatternsService },
            ],
        }).compile();

        service = module.get<TransactionImportService>(TransactionImportService);

        mockPrismaService.transaction.findMany.mockResolvedValue([]); // no existing externalIds
        mockPrismaService.transaction.findFirst.mockResolvedValue(null); // no natural-key duplicates
        mockPrismaService.transaction.createMany.mockResolvedValue({ count: 1 });
        mockPrismaService.transaction.update.mockResolvedValue({});
        mockPrismaService.transaction.updateMany.mockResolvedValue({ count: 1 });
        mockPrismaService.category.findMany.mockResolvedValue([]);
        mockPrismaService.account.findMany.mockResolvedValue([
            { id: "account-1", accountNumber: "1234", currencyId: "cur-ils" },
        ]);
        mockPrismaService.currency.findMany.mockResolvedValue([
            { id: "cur-usd", code: "USD", symbol: "$" },
            { id: "cur-ils", code: "ILS", symbol: "₪" },
        ]);
        mockPrismaService.categoryMappingRule.findMany.mockResolvedValue([]);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    const importedRow = async () => {
        const call = mockPrismaService.transaction.createMany.mock.calls[0][0];
        return call.data[0];
    };

    it("classifies a pattern-matched debit as a hidden out-transfer", async () => {
        mockCardPayoffPatternsService.checkDescription.mockResolvedValue(true);

        const result = await service.importTransactions(
            "user-1",
            [makeCandidate({ description: "כ.א.ל חיוב", signedAmount: -1000, amount: 1000 })],
            "ILS",
        );

        expect(result.success).toBe(true);
        const row = await importedRow();
        expect(row).toMatchObject({ type: "transfer", hidden: true, transferDirection: "out" });
    });

    it("classifies a pattern-matched credit as a hidden in-transfer", async () => {
        mockCardPayoffPatternsService.checkDescription.mockResolvedValue(true);

        await service.importTransactions(
            "user-1",
            [makeCandidate({ description: "העברה מחיסכון", signedAmount: 500, amount: 500 })],
            "ILS",
        );

        const row = await importedRow();
        expect(row).toMatchObject({ type: "transfer", hidden: true, transferDirection: "in" });
    });

    it("classifies an unmatched debit as a visible expense with no direction", async () => {
        mockCardPayoffPatternsService.checkDescription.mockResolvedValue(false);

        await service.importTransactions("user-1", [makeCandidate({ signedAmount: -250, amount: 250 })], "ILS");

        const row = await importedRow();
        expect(row).toMatchObject({ type: "expense", hidden: false, transferDirection: null });
    });

    it("classifies an unmatched credit as a visible income with no direction", async () => {
        mockCardPayoffPatternsService.checkDescription.mockResolvedValue(false);

        await service.importTransactions("user-1", [makeCandidate({ signedAmount: 15000, amount: 15000 })], "ILS");

        const row = await importedRow();
        expect(row).toMatchObject({ type: "income", hidden: false, transferDirection: null });
    });

    describe("date self-heal", () => {
        const D = new Date("2026-10-01T00:00:00.000Z");
        const Dm1 = new Date("2026-09-30T00:00:00.000Z");
        const healCandidate = (overrides: Partial<ImportCandidate> = {}) =>
            makeCandidate({
                externalId: "ext-1",
                accountNumber: "1234",
                transactionDate: D,
                postedDate: D,
                legacyTransactionDate: Dm1,
                legacyPostedDate: Dm1,
                ...overrides,
            });
        const row = (overrides: Record<string, unknown> = {}) => ({
            id: "t1",
            accountId: "account-1",
            externalId: "ext-1",
            transactionDate: Dm1,
            postedDate: Dm1,
            ...overrides,
        });
        const run = (candidates: ImportCandidate[], rows: unknown[]) => {
            mockPrismaService.transaction.findMany.mockResolvedValue(rows);
            return service.importTransactions("user-1", candidates, "ILS");
        };

        it("rewrites a row still holding the legacy dates", async () => {
            const logSpy = jest.spyOn(Logger.prototype, "log");
            await run([healCandidate()], [row()]);

            expect(mockPrismaService.transaction.updateMany).toHaveBeenCalledTimes(3);
            expect(mockPrismaService.transaction.updateMany).toHaveBeenCalledWith({
                where: { counterpartOfId: "t1" },
                data: { transactionDate: D },
            });
            expect(mockPrismaService.transaction.updateMany).toHaveBeenCalledWith({
                where: { id: "t1", transactionDate: Dm1 },
                data: { transactionDate: D },
            });
            expect(mockPrismaService.transaction.updateMany).toHaveBeenCalledWith({
                where: { id: "t1", postedDate: Dm1 },
                data: { postedDate: D },
            });
            expect(mockPrismaService.transaction.createMany).not.toHaveBeenCalled();
            expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("1 row(s) with corrected dates"));
        });

        it("does not touch the mirror when the transactionDate update matched nothing", async () => {
            mockPrismaService.transaction.updateMany.mockResolvedValue({ count: 0 });
            await run([healCandidate()], [row()]);
            expect(mockPrismaService.transaction.updateMany).not.toHaveBeenCalledWith(
                expect.objectContaining({ where: { counterpartOfId: "t1" } }),
            );
        });

        it("leaves a user-edited date alone", async () => {
            await run([healCandidate()], [row({ transactionDate: new Date("2026-09-25"), postedDate: null })]);
            expect(mockPrismaService.transaction.updateMany).not.toHaveBeenCalled();
        });

        it("does nothing when the row is already correct", async () => {
            await run([healCandidate()], [row({ transactionDate: D, postedDate: D })]);
            expect(mockPrismaService.transaction.updateMany).not.toHaveBeenCalled();
        });

        it("corrects only the field that holds the legacy value", async () => {
            await run([healCandidate()], [row({ transactionDate: D })]);
            expect(mockPrismaService.transaction.updateMany).toHaveBeenCalledTimes(1);
            expect(mockPrismaService.transaction.updateMany).toHaveBeenCalledWith({
                where: { id: "t1", postedDate: Dm1 },
                data: { postedDate: D },
            });
        });

        it("does not count a row changed concurrently (count 0)", async () => {
            mockPrismaService.transaction.updateMany.mockResolvedValue({ count: 0 });
            const logSpy = jest.spyOn(Logger.prototype, "log");
            await run([healCandidate()], [row()]);
            expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("0 row(s) with corrected dates"));
        });

        it("ignores rows of a different account", async () => {
            await run([healCandidate()], [row({ accountId: "account-2" })]);
            expect(mockPrismaService.transaction.updateMany).not.toHaveBeenCalled();
        });

        it("does not heal candidates without legacy fields", async () => {
            await run([healCandidate({ legacyTransactionDate: undefined, legacyPostedDate: undefined })], [row()]);
            expect(mockPrismaService.transaction.updateMany).not.toHaveBeenCalled();
        });

        it("keeps the import successful when the update fails", async () => {
            mockPrismaService.transaction.updateMany.mockRejectedValue(new Error("db down"));
            const result = await run([healCandidate()], [row()]);
            expect(result.success).toBe(true);
            expect(result.warnings.some((w) => w.includes("Date correction"))).toBe(true);
        });

        it("updates a row once when several candidates share its externalId", async () => {
            await run([healCandidate(), healCandidate()], [row()]);
            expect(mockPrismaService.transaction.updateMany).toHaveBeenCalledTimes(3);
        });
    });
});
