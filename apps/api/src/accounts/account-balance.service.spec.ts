import { Test, TestingModule } from "@nestjs/testing";
import { Decimal } from "@prisma/client/runtime/library";
import { AccountBalanceService, RecordableBalance } from "./account-balance.service";
import { PrismaService } from "../prisma/prisma.service";

describe("AccountBalanceService", () => {
    let service: AccountBalanceService;

    const mockTx = {
        account: {
            create: jest.fn(),
            update: jest.fn(),
        },
        accountBalanceSnapshot: {
            create: jest.fn(),
        },
    };

    const mockPrismaService = {
        account: {
            findMany: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
        },
        accountBalanceSnapshot: {
            create: jest.fn(),
        },
        currency: {
            findMany: jest.fn(),
        },
        transaction: {
            groupBy: jest.fn(),
        },
        $transaction: jest.fn(),
    };

    const balance = (overrides: Partial<RecordableBalance> = {}): RecordableBalance => ({
        accountNumber: "1234",
        amount: 1500.55,
        balanceDate: null,
        isSavings: false,
        cardFrame: null,
        cardIssuer: null,
        ...overrides,
    });

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [AccountBalanceService, { provide: PrismaService, useValue: mockPrismaService }],
        }).compile();

        service = module.get<AccountBalanceService>(AccountBalanceService);

        // $transaction now receives an interactive callback; invoke it with a tx object that
        // mirrors the delegates used inside recordBalances, and forward account.create/update
        // calls made directly against mockPrismaService.account (used by tests that assert on them).
        mockTx.account.create.mockImplementation((args: unknown) => mockPrismaService.account.create(args));
        mockTx.account.update.mockImplementation((args: unknown) => mockPrismaService.account.update(args));
        mockTx.accountBalanceSnapshot.create.mockImplementation((args: unknown) =>
            mockPrismaService.accountBalanceSnapshot.create(args),
        );
        mockPrismaService.$transaction.mockImplementation((callback: (tx: unknown) => unknown) => callback(mockTx));
        mockPrismaService.currency.findMany.mockResolvedValue([
            { id: "usd-id", code: "USD" },
            { id: "ils-id", code: "ILS" },
        ]);
        mockPrismaService.transaction.groupBy.mockResolvedValue([]);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe("recordBalances", () => {
        it("appends a snapshot and refreshes the account's denormalized balance", async () => {
            mockPrismaService.account.findMany.mockResolvedValue([
                { id: "acct-1", currencyId: "ils-id", deletedAt: null },
            ]);

            const balanceDate = new Date("2026-10-02");
            const result = await service.recordBalances("user-1", {
                balances: [balance({ balanceDate })],
                kind: "next_charge",
                scraperJobId: "job-1",
            });

            expect(result).toEqual({ recorded: 1, accountsCreated: 0 });

            expect(mockPrismaService.accountBalanceSnapshot.create).toHaveBeenCalledWith({
                data: expect.objectContaining({
                    userId: "user-1",
                    accountId: "acct-1",
                    scraperJobId: "job-1",
                    currencyId: "ils-id",
                    kind: "next_charge",
                    balanceDate,
                }),
            });

            expect(mockPrismaService.account.update).toHaveBeenCalledWith({
                where: { id: "acct-1" },
                data: expect.objectContaining({ balanceKind: "next_charge", balanceDate }),
            });
        });

        it("creates the account when it doesn't exist yet (leumi savings arrive with txns: [])", async () => {
            mockPrismaService.account.findMany.mockResolvedValue([]);
            mockPrismaService.account.create.mockResolvedValue({ id: "new-acct" });
            mockPrismaService.transaction.groupBy.mockResolvedValue([{ currencyId: "ils-id" }]);

            const result = await service.recordBalances("user-1", {
                balances: [balance({ accountNumber: "123-45", amount: 90000, isSavings: true })],
                kind: "account_balance",
            });

            expect(result).toEqual({ recorded: 1, accountsCreated: 1 });
            expect(mockPrismaService.account.create).toHaveBeenCalledWith({
                data: expect.objectContaining({
                    userId: "user-1",
                    name: "123-45",
                    accountNumber: "123-45",
                    type: "unknown",
                    currencyId: "ils-id",
                }),
                select: { id: true },
            });
            expect(mockPrismaService.accountBalanceSnapshot.create).toHaveBeenCalledWith({
                data: expect.objectContaining({ accountId: "new-acct", kind: "account_balance" }),
            });
        });

        it("doesn't count an account whose transaction rolled back", async () => {
            // The create and the snapshot insert share one transaction, so a snapshot failure
            // un-creates the account — reporting it as created would claim a row that isn't there.
            mockPrismaService.account.findMany.mockResolvedValue([]);
            mockPrismaService.account.create.mockResolvedValue({ id: "new-acct" });
            mockPrismaService.transaction.groupBy.mockResolvedValue([{ currencyId: "ils-id" }]);
            // Once, not persistent: clearAllMocks() resets calls but keeps implementations.
            mockPrismaService.accountBalanceSnapshot.create.mockRejectedValueOnce(new Error("numeric field overflow"));

            const result = await service.recordBalances("user-1", {
                balances: [balance({ accountNumber: "123-45" })],
                kind: "account_balance",
            });

            expect(result).toEqual({ recorded: 0, accountsCreated: 0 });
        });

        it("skips everything for an unrecognized companyId (no known balance semantics)", async () => {
            const result = await service.recordBalances("user-1", {
                balances: [balance()],
                kind: null,
            });

            expect(result).toEqual({ recorded: 0, accountsCreated: 0 });
            expect(mockPrismaService.account.findMany).not.toHaveBeenCalled();
            expect(mockPrismaService.accountBalanceSnapshot.create).not.toHaveBeenCalled();
        });

        it("scopes the account lookup to the user without excluding soft-deleted rows", async () => {
            mockPrismaService.account.findMany.mockResolvedValue([
                { id: "acct-1", currencyId: "ils-id", deletedAt: null },
            ]);

            await service.recordBalances("user-1", { balances: [balance()], kind: "account_balance" });

            expect(mockPrismaService.account.findMany).toHaveBeenCalledWith({
                where: { userId: "user-1", accountNumber: "1234" },
                select: { id: true, currencyId: true, deletedAt: true },
            });
        });

        it("skips a soft-deleted account instead of recreating it", async () => {
            mockPrismaService.account.findMany.mockResolvedValue([
                { id: "acct-1", currencyId: "ils-id", deletedAt: new Date("2026-01-01") },
            ]);

            const result = await service.recordBalances("user-1", {
                balances: [balance()],
                kind: "account_balance",
            });

            expect(result).toEqual({ recorded: 0, accountsCreated: 0 });
            expect(mockPrismaService.account.create).not.toHaveBeenCalled();
            expect(mockPrismaService.accountBalanceSnapshot.create).not.toHaveBeenCalled();
            expect(mockPrismaService.account.update).not.toHaveBeenCalled();
        });

        it("stores cardFrame and cardIssuer on both the snapshot and the account", async () => {
            mockPrismaService.account.findMany.mockResolvedValue([
                { id: "acct-1", currencyId: "ils-id", deletedAt: null },
            ]);

            await service.recordBalances("user-1", {
                balances: [balance({ cardFrame: 15000, cardIssuer: "companyIssued" })],
                kind: "utilized_credit",
            });

            expect(mockPrismaService.accountBalanceSnapshot.create).toHaveBeenCalledWith({
                data: expect.objectContaining({
                    cardFrame: new Decimal(15000),
                    cardIssuer: "companyIssued",
                }),
            });
            expect(mockPrismaService.account.update).toHaveBeenCalledWith({
                where: { id: "acct-1" },
                data: expect.objectContaining({
                    cardFrame: new Decimal(15000),
                    cardIssuer: "companyIssued",
                }),
            });
        });

        it("clears a stale frame rather than leaving the old limit behind", async () => {
            // The columns are a *latest observation*: a card that stops reporting a frame (or was
            // cancelled) must not keep advertising the limit it had last month.
            mockPrismaService.account.findMany.mockResolvedValue([
                { id: "acct-1", currencyId: "ils-id", deletedAt: null },
            ]);

            await service.recordBalances("user-1", {
                balances: [balance({ cardFrame: null, cardIssuer: null })],
                kind: "utilized_credit",
            });

            expect(mockPrismaService.account.update).toHaveBeenCalledWith({
                where: { id: "acct-1" },
                data: expect.objectContaining({ cardFrame: null, cardIssuer: null }),
            });
        });

        it("prefers a live account over a soft-deleted one sharing the same number", async () => {
            mockPrismaService.account.findMany.mockResolvedValue([
                { id: "deleted-acct", currencyId: "ils-id", deletedAt: new Date("2026-01-01") },
                { id: "live-acct", currencyId: "ils-id", deletedAt: null },
            ]);

            const result = await service.recordBalances("user-1", {
                balances: [balance()],
                kind: "account_balance",
            });

            expect(result).toEqual({ recorded: 1, accountsCreated: 0 });
            expect(mockPrismaService.accountBalanceSnapshot.create).toHaveBeenCalledWith({
                data: expect.objectContaining({ accountId: "live-acct" }),
            });
        });

        it("continues recording remaining balances after one fails", async () => {
            mockPrismaService.account.findMany
                .mockResolvedValueOnce([{ id: "acct-1", currencyId: "ils-id", deletedAt: null }])
                .mockResolvedValueOnce([{ id: "acct-2", currencyId: "ils-id", deletedAt: null }]);
            mockPrismaService.$transaction
                .mockImplementationOnce(() => Promise.reject(new Error("DB error")))
                .mockImplementationOnce((callback: (tx: unknown) => unknown) => callback(mockTx));

            const result = await service.recordBalances("user-1", {
                balances: [balance({ accountNumber: "1234" }), balance({ accountNumber: "5678" })],
                kind: "account_balance",
            });

            expect(result).toEqual({ recorded: 1, accountsCreated: 0 });
            expect(mockPrismaService.accountBalanceSnapshot.create).toHaveBeenCalledTimes(1);
            expect(mockPrismaService.accountBalanceSnapshot.create).toHaveBeenCalledWith({
                data: expect.objectContaining({ accountId: "acct-2" }),
            });
        });

        it("pins the resolved fallback currency onto an account that has none", async () => {
            mockPrismaService.account.findMany.mockResolvedValue([{ id: "acct-1", currencyId: null, deletedAt: null }]);

            await service.recordBalances("user-1", {
                balances: [balance()],
                kind: "account_balance",
                defaultCurrencyCode: "ILS",
            });

            expect(mockPrismaService.account.update).toHaveBeenCalledWith({
                where: { id: "acct-1" },
                data: expect.objectContaining({ currencyId: "ils-id" }),
            });
        });

        it("does not overwrite an account's existing currency", async () => {
            mockPrismaService.account.findMany.mockResolvedValue([
                { id: "acct-1", currencyId: "usd-id", deletedAt: null },
            ]);

            await service.recordBalances("user-1", {
                balances: [balance()],
                kind: "account_balance",
                defaultCurrencyCode: "ILS",
            });

            expect(mockPrismaService.account.update).toHaveBeenCalledWith({
                where: { id: "acct-1" },
                data: expect.not.objectContaining({ currencyId: expect.anything() }),
            });
        });

        it("falls back to the default currency when the account has none", async () => {
            mockPrismaService.account.findMany.mockResolvedValue([{ id: "acct-1", currencyId: null, deletedAt: null }]);

            await service.recordBalances("user-1", {
                balances: [balance()],
                kind: "account_balance",
                defaultCurrencyCode: "ILS",
            });

            expect(mockPrismaService.accountBalanceSnapshot.create).toHaveBeenCalledWith({
                data: expect.objectContaining({ currencyId: "ils-id" }),
            });
        });

        it("falls back to ILS when nothing else determines the currency", async () => {
            // No explicit code, no existing account, and no transactions to infer from.
            mockPrismaService.account.findMany.mockResolvedValue([]);
            mockPrismaService.account.create.mockResolvedValue({ id: "new-acct" });
            mockPrismaService.transaction.groupBy.mockResolvedValue([]);

            await service.recordBalances("user-1", { balances: [balance()], kind: "account_balance" });

            expect(mockPrismaService.account.create).toHaveBeenCalledWith({
                data: expect.objectContaining({ currencyId: "ils-id" }),
                select: { id: true },
            });
            expect(mockPrismaService.accountBalanceSnapshot.create).toHaveBeenCalledWith({
                data: expect.objectContaining({ currencyId: "ils-id" }),
            });
        });

        it("does no work for an empty balance list", async () => {
            expect(await service.recordBalances("user-1", { balances: [], kind: "account_balance" })).toEqual({
                recorded: 0,
                accountsCreated: 0,
            });
            expect(mockPrismaService.account.findMany).not.toHaveBeenCalled();
        });
    });
});
