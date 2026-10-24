import { Test, TestingModule } from "@nestjs/testing";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { AccountsService } from "./accounts.service";
import { PrismaService } from "../prisma/prisma.service";

describe("AccountsService", () => {
    let service: AccountsService;
    let prisma: PrismaService;

    const mockPrismaService = {
        $transaction: jest.fn(),
        account: {
            create: jest.fn(),
            findMany: jest.fn(),
            findFirst: jest.fn(),
            update: jest.fn(),
            updateMany: jest.fn(),
        },
        transaction: {
            groupBy: jest.fn(),
            create: jest.fn(),
            count: jest.fn(),
        },
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                AccountsService,
                {
                    provide: PrismaService,
                    useValue: mockPrismaService,
                },
            ],
        }).compile();

        service = module.get<AccountsService>(AccountsService);
        prisma = module.get<PrismaService>(PrismaService);
    });

    afterEach(() => {
        jest.resetAllMocks();
    });

    const dec = (n: number) => new Prisma.Decimal(n);
    const group = (
        accountId: string,
        type: string,
        transferDirection: string | null,
        amount: number,
        date = new Date(),
    ) => ({
        accountId,
        type,
        transferDirection,
        _sum: { amount: dec(amount) },
        _max: { transactionDate: date },
    });
    const cashRow = (over: Record<string, unknown> = {}) => ({
        id: "cash-1",
        name: "Wallet",
        type: "cash",
        userId: "user-123",
        currencyId: "cur-1",
        balance: null,
        balanceKind: null,
        cardFrame: null,
        currency: { id: "cur-1", code: "ILS" },
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        ...over,
    });
    /** Mocks the two groupBy calls of computeCashStats: balance groups, then linked-row counts. */
    const mockCashRows = (groups: unknown[], linked: unknown[] = []) =>
        mockPrismaService.transaction.groupBy.mockResolvedValueOnce(groups).mockResolvedValueOnce(linked);

    it("should be defined", () => {
        expect(service).toBeDefined();
    });

    describe("create", () => {
        it("rejects a cash account without a currency", async () => {
            await expect(service.create("user-123", { name: "Wallet", type: "cash" })).rejects.toThrow(
                BadRequestException,
            );
            expect(mockPrismaService.account.create).not.toHaveBeenCalled();
        });

        it("rejects a savings account without a currency", async () => {
            await expect(service.create("user-123", { name: "Pot", type: "savings" })).rejects.toThrow(
                "A savings account needs a currency",
            );
            expect(mockPrismaService.account.create).not.toHaveBeenCalled();
        });

        it("creates a savings account with a currency and reports its ledger balance kind", async () => {
            mockPrismaService.account.create.mockResolvedValue(cashRow({ id: "sav-1", name: "Pot", type: "savings" }));
            mockCashRows([]);

            const result = await service.create("user-123", { name: "Pot", type: "savings", currencyId: "cur-1" });

            expect(result.type).toBe("savings");
            expect(mockPrismaService.account.create).toHaveBeenCalledWith({
                data: { name: "Pot", type: "savings", currencyId: "cur-1", userId: "user-123" },
                include: { currency: true },
            });
        });

        it("should create an account", async () => {
            const userId = "user-123";
            const createDto = {
                name: "Test Account",
                type: "bank",
                icon: "bank-icon",
                color: "#FF5722",
            };

            const createdRow = {
                id: "account-123",
                ...createDto,
                userId,
                balance: null,
                cardFrame: null,
                currency: null,
                createdAt: new Date(),
                updatedAt: new Date(),
                deletedAt: null,
            };

            mockPrismaService.account.create.mockResolvedValue(createdRow);

            const result = await service.create(userId, createDto);

            expect(result).toEqual({
                ...createdRow,
                hasLinkedTransfers: false,
                hasTransactions: false,
                lastTransactionDate: null,
            });
            expect(mockPrismaService.account.create).toHaveBeenCalledWith({
                data: { ...createDto, userId },
                include: { currency: true },
            });
        });

        it("converts a Decimal balance/cardFrame on the created row to numbers", async () => {
            const userId = "user-123";
            const createDto = {
                name: "Test Account",
                type: "credit_card",
                icon: "card-icon",
                color: "#FF5722",
            };

            const createdRow = {
                id: "account-123",
                ...createDto,
                userId,
                balance: new Prisma.Decimal("-1234.56"),
                cardFrame: new Prisma.Decimal("10000"),
                currency: null,
                createdAt: new Date(),
                updatedAt: new Date(),
                deletedAt: null,
            };

            mockPrismaService.account.create.mockResolvedValue(createdRow);

            const result = await service.create(userId, createDto);

            expect(result.balance).toBe(-1234.56);
            expect(typeof result.balance).toBe("number");
            expect(result.cardFrame).toBe(10000);
            expect(typeof result.cardFrame).toBe("number");
        });
    });

    describe("findAll", () => {
        it("should return all accounts for a user with Decimal balance/cardFrame converted to numbers", async () => {
            const userId = "user-123";
            const rows = [
                {
                    id: "account-1",
                    name: "Account 1",
                    type: "bank",
                    userId,
                    balance: new Prisma.Decimal("-1234.56"),
                    cardFrame: new Prisma.Decimal("10000"),
                    currency: { id: "cur-1", code: "ILS" },
                    createdAt: new Date(),
                    updatedAt: new Date(),
                    deletedAt: null,
                },
                {
                    id: "account-2",
                    name: "Account 2",
                    type: "cash",
                    userId,
                    balance: null,
                    cardFrame: null,
                    currency: null,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                    deletedAt: null,
                },
            ];

            mockPrismaService.account.findMany.mockResolvedValue(rows);
            mockCashRows([]);

            const result = await service.findAll(userId);

            expect(result[0].balance).toBe(-1234.56);
            expect(typeof result[0].balance).toBe("number");
            expect(result[0].cardFrame).toBe(10000);
            expect(typeof result[0].cardFrame).toBe("number");
            expect(result[1].balance).toBeNull();
            expect(result[1].cardFrame).toBeNull();
            expect(mockPrismaService.account.findMany).toHaveBeenCalledWith({
                where: { userId, deletedAt: null },
                orderBy: { createdAt: "desc" },
                include: { currency: true },
            });
        });

        it("serializes to JSON with numeric balance, guarding against Decimal.toJSON() yielding a string", async () => {
            const userId = "user-123";
            const rows = [
                {
                    id: "account-1",
                    name: "Account 1",
                    type: "bank",
                    userId,
                    balance: new Prisma.Decimal("-1234.56"),
                    cardFrame: new Prisma.Decimal("10000"),
                    currency: null,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                    deletedAt: null,
                },
            ];

            mockPrismaService.account.findMany.mockResolvedValue(rows);

            const result = await service.findAll(userId);
            const roundTripped = JSON.parse(JSON.stringify(result));

            expect(typeof roundTripped[0].balance).toBe("number");
            expect(roundTripped[0].balance).toBe(-1234.56);
        });
    });

    describe("cash balance", () => {
        it("computes income + transfers in - expenses, hidden included (AC2)", async () => {
            mockPrismaService.account.findMany.mockResolvedValue([cashRow()]);
            const last = new Date("2026-05-02");
            mockCashRows([
                group("cash-1", "income", null, 0, new Date("2026-05-01")),
                group("cash-1", "transfer", "in", 700, last),
                group("cash-1", "expense", null, 643.4, new Date("2026-05-01")),
            ]);

            const [result] = await service.findAll("user-123");

            expect(result.balance).toBe(56.6);
            expect(result.balanceKind).toBe("cash_on_hand");
            expect(result.lastTransactionDate).toEqual(last);
            expect(result.hasLinkedTransfers).toBe(false);
            const where = mockPrismaService.transaction.groupBy.mock.calls[0][0].where;
            expect(where).toEqual({ userId: "user-123", deletedAt: null, accountId: { in: ["cash-1"] } });
        });

        it("treats a transfer with no direction as out", async () => {
            mockPrismaService.account.findMany.mockResolvedValue([cashRow()]);
            mockCashRows([group("cash-1", "transfer", null, 10)]);
            const [result] = await service.findAll("user-123");
            expect(result.balance).toBe(-10);
        });

        it("leaves a cash account with no rows without balance or kind", async () => {
            mockPrismaService.account.findMany.mockResolvedValue([cashRow()]);
            mockCashRows([]);
            const [result] = await service.findAll("user-123");
            expect(result.balance).toBeNull();
            expect(result.balanceKind).toBeNull();
            expect(result.lastTransactionDate).toBeNull();
        });

        it("overlays savings with account_balance and keeps cash as cash_on_hand in the same call", async () => {
            const last = new Date("2026-06-01");
            mockPrismaService.account.findMany.mockResolvedValue([
                cashRow(),
                cashRow({ id: "sav-1", name: "Pot", type: "savings" }),
            ]);
            mockCashRows(
                [group("cash-1", "income", null, 100), group("sav-1", "income", null, 50, last)],
                [{ accountId: "sav-1", _count: { _all: 1 } }],
            );

            const [cash, savings] = await service.findAll("user-123");

            expect(cash.balance).toBe(100);
            expect(cash.balanceKind).toBe("cash_on_hand");
            expect(cash.hasLinkedTransfers).toBe(false);
            expect(savings.balance).toBe(50);
            expect(savings.balanceKind).toBe("account_balance");
            expect(savings.hasTransactions).toBe(true);
            expect(savings.hasLinkedTransfers).toBe(true);
            expect(savings.lastTransactionDate).toEqual(last);
            const where = mockPrismaService.transaction.groupBy.mock.calls[0][0].where;
            expect(where).toEqual({ userId: "user-123", deletedAt: null, accountId: { in: ["cash-1", "sav-1"] } });
        });

        it("leaves a savings account with no rows without balance or kind", async () => {
            mockPrismaService.account.findMany.mockResolvedValue([cashRow({ id: "sav-1", type: "savings" })]);
            mockCashRows([]);
            const [result] = await service.findAll("user-123");
            expect(result.balance).toBeNull();
            expect(result.balanceKind).toBeNull();
            expect(result.lastTransactionDate).toBeNull();
        });

        it("leaves non-cash accounts untouched and does not query when there is no cash account", async () => {
            mockPrismaService.account.findMany.mockResolvedValue([
                cashRow({ id: "b1", type: "bank", balance: dec(5), balanceKind: "account_balance" }),
            ]);
            const [result] = await service.findAll("user-123");
            expect(result.balance).toBe(5);
            expect(result.balanceKind).toBe("account_balance");
            expect(mockPrismaService.transaction.groupBy).not.toHaveBeenCalled();
        });

        it("computes hasLinkedTransfers", async () => {
            mockPrismaService.account.findFirst.mockResolvedValue(cashRow());
            mockCashRows([group("cash-1", "income", null, 5)], [{ accountId: "cash-1", _count: { _all: 1 } }]);
            const result = await service.findOne("cash-1", "user-123");
            expect(result.hasLinkedTransfers).toBe(true);
        });
    });

    describe("findOne", () => {
        it("should return a mapped account by id", async () => {
            const userId = "user-123";
            const accountId = "account-123";
            const row = {
                id: accountId,
                name: "Test Account",
                type: "bank",
                userId,
                balance: new Prisma.Decimal("500"),
                cardFrame: null,
                currency: { id: "cur-1", code: "ILS" },
                createdAt: new Date(),
                updatedAt: new Date(),
                deletedAt: null,
            };

            mockPrismaService.account.findFirst.mockResolvedValue(row);

            const result = await service.findOne(accountId, userId);

            expect(result.balance).toBe(500);
            expect(typeof result.balance).toBe("number");
            expect(result.cardFrame).toBeNull();
            expect(result.currency).toEqual({ id: "cur-1", code: "ILS" });
            expect(mockPrismaService.account.findFirst).toHaveBeenCalledWith({
                where: { id: accountId, userId, deletedAt: null },
                include: { currency: true },
            });
        });

        it("should throw NotFoundException if account not found", async () => {
            const userId = "user-123";
            const accountId = "non-existent";

            mockPrismaService.account.findFirst.mockResolvedValue(null);

            await expect(service.findOne(accountId, userId)).rejects.toThrow(NotFoundException);
        });
    });

    describe("update", () => {
        it("rejects changing a currency-less account to cash", async () => {
            mockPrismaService.account.findFirst.mockResolvedValue({ type: "bank", currencyId: null });
            await expect(service.update("a1", "user-123", { type: "cash" })).rejects.toThrow(BadRequestException);
            expect(mockPrismaService.account.update).not.toHaveBeenCalled();
        });

        it("rejects clearing the currency of a cash account", async () => {
            mockPrismaService.account.findFirst.mockResolvedValue({ type: "cash", currencyId: "cur-1" });
            await expect(service.update("a1", "user-123", { currencyId: null as any })).rejects.toThrow(
                BadRequestException,
            );
            expect(mockPrismaService.account.update).not.toHaveBeenCalled();
        });

        describe("linked cash wallets", () => {
            const linkedStats = () =>
                mockCashRows([group("a1", "income", null, 5)], [{ accountId: "a1", _count: { _all: 1 } }]);

            it("rejects a currency change on a linked wallet", async () => {
                mockPrismaService.account.findFirst.mockResolvedValue({ type: "cash", currencyId: "cur-1" });
                linkedStats();
                await expect(service.update("a1", "user-123", { currencyId: "cur-2" })).rejects.toThrow(
                    "This account has linked transfers, so its currency can't change",
                );
                expect(mockPrismaService.account.update).not.toHaveBeenCalled();
            });

            it("rejects a type change on a linked wallet", async () => {
                mockPrismaService.account.findFirst.mockResolvedValue({ type: "cash", currencyId: "cur-1" });
                linkedStats();
                await expect(service.update("a1", "user-123", { type: "bank" })).rejects.toThrow(
                    "This account has linked transfers, so its type can't change",
                );
            });

            it("allows a currency change on an unlinked wallet", async () => {
                mockPrismaService.account.findFirst.mockResolvedValue({ type: "cash", currencyId: "cur-1" });
                mockPrismaService.account.update.mockResolvedValue(cashRow({ id: "a1", currencyId: "cur-2" }));
                mockCashRows([]);
                mockCashRows([]);
                await service.update("a1", "user-123", { currencyId: "cur-2" });
                expect(mockPrismaService.account.update).toHaveBeenCalled();
            });

            it("rejects a currency change on an unlinked wallet that has transactions", async () => {
                mockPrismaService.account.findFirst.mockResolvedValue({ type: "cash", currencyId: "cur-1" });
                mockCashRows([group("a1", "expense", null, 5)]);
                await expect(service.update("a1", "user-123", { currencyId: "cur-2" })).rejects.toThrow(
                    "This account has transactions, so its currency can't change",
                );
                expect(mockPrismaService.account.update).not.toHaveBeenCalled();
            });

            it("allows a type change on an unlinked wallet that has transactions", async () => {
                mockPrismaService.account.findFirst.mockResolvedValue({ type: "cash", currencyId: "cur-1" });
                mockPrismaService.account.update.mockResolvedValue(cashRow({ id: "a1", type: "bank" }));
                mockCashRows([group("a1", "expense", null, 5)]);
                mockCashRows([]);
                await service.update("a1", "user-123", { type: "bank" });
                expect(mockPrismaService.account.update).toHaveBeenCalled();
            });

            it("allows re-saving the same currency on a wallet with transactions without querying", async () => {
                mockPrismaService.account.findFirst.mockResolvedValue({ type: "cash", currencyId: "cur-1" });
                mockPrismaService.account.update.mockResolvedValue(cashRow({ id: "a1" }));
                mockCashRows([group("a1", "expense", null, 5)]);
                await service.update("a1", "user-123", { currencyId: "cur-1", name: "Renamed" });
                expect(mockPrismaService.account.update).toHaveBeenCalled();
            });
        });

        describe("savings accounts", () => {
            const linked = () =>
                mockCashRows([group("a1", "income", null, 5)], [{ accountId: "a1", _count: { _all: 1 } }]);

            it("rejects a currency change on a savings account with transactions", async () => {
                mockPrismaService.account.findFirst.mockResolvedValue({ type: "savings", currencyId: "cur-1" });
                mockCashRows([group("a1", "expense", null, 5)]);
                await expect(service.update("a1", "user-123", { currencyId: "cur-2" })).rejects.toThrow(
                    "This account has transactions, so its currency can't change",
                );
                expect(mockPrismaService.account.update).not.toHaveBeenCalled();
            });

            it("rejects a currency change on a savings account with linked transfers", async () => {
                mockPrismaService.account.findFirst.mockResolvedValue({ type: "savings", currencyId: "cur-1" });
                linked();
                await expect(service.update("a1", "user-123", { currencyId: "cur-2" })).rejects.toThrow(
                    "This account has linked transfers, so its currency can't change",
                );
                expect(mockPrismaService.account.update).not.toHaveBeenCalled();
            });

            it("rejects a type change on a savings account with linked transfers", async () => {
                mockPrismaService.account.findFirst.mockResolvedValue({ type: "savings", currencyId: "cur-1" });
                linked();
                await expect(service.update("a1", "user-123", { type: "bank" })).rejects.toThrow(
                    "This account has linked transfers, so its type can't change",
                );
                expect(mockPrismaService.account.update).not.toHaveBeenCalled();
            });

            it("rejects turning a cash account with linked transfers into savings", async () => {
                mockPrismaService.account.findFirst.mockResolvedValue({ type: "cash", currencyId: "cur-1" });
                linked();
                await expect(service.update("a1", "user-123", { type: "savings" })).rejects.toThrow(
                    "This account has linked transfers, so its type can't change",
                );
                expect(mockPrismaService.account.update).not.toHaveBeenCalled();
            });

            it("allows turning an unlinked cash account into savings", async () => {
                mockPrismaService.account.findFirst.mockResolvedValue({ type: "cash", currencyId: "cur-1" });
                mockPrismaService.account.update.mockResolvedValue(cashRow({ id: "a1", type: "savings" }));
                // Pre-update stats (none), then the response overlay for the now-savings row (none).
                mockCashRows([]);
                mockCashRows([]);
                mockCashRows([]);
                mockCashRows([]);
                const result = await service.update("a1", "user-123", { type: "savings" });
                expect(mockPrismaService.account.update).toHaveBeenCalledWith({
                    where: { id: "a1" },
                    data: { type: "savings" },
                    include: { currency: true },
                });
                expect(result.type).toBe("savings");
            });

            it("rejects a bank account with a transaction in another currency becoming savings", async () => {
                mockPrismaService.account.findFirst.mockResolvedValue({ type: "bank", currencyId: "cur-1" });
                mockPrismaService.transaction.count.mockResolvedValue(1);
                await expect(service.update("a1", "user-123", { type: "savings" })).rejects.toThrow(
                    "This account has transactions in another currency, so it can't become a savings account",
                );
                expect(mockPrismaService.account.update).not.toHaveBeenCalled();
            });

            it("rejects a PATCH to savings that clears the currency", async () => {
                mockPrismaService.account.findFirst.mockResolvedValue({ type: "bank", currencyId: "cur-1" });
                await expect(
                    service.update("a1", "user-123", { type: "savings", currencyId: null as unknown as string }),
                ).rejects.toThrow("A savings account needs a currency");
                expect(mockPrismaService.account.update).not.toHaveBeenCalled();
            });
        });

        describe("retyping to cash", () => {
            it("rejects a bank account with a transaction in another currency than its own", async () => {
                mockPrismaService.account.findFirst.mockResolvedValue({ type: "bank", currencyId: "cur-1" });
                mockPrismaService.transaction.count.mockResolvedValue(1);
                await expect(service.update("a1", "user-123", { type: "cash" })).rejects.toThrow(
                    "This account has transactions in another currency, so it can't become a cash account",
                );
                expect(mockPrismaService.transaction.count).toHaveBeenCalledWith({
                    where: { accountId: "a1", userId: "user-123", deletedAt: null, currencyId: { not: "cur-1" } },
                });
                expect(mockPrismaService.account.update).not.toHaveBeenCalled();
            });

            it("checks transactions against the currency the account is changing to in the same request", async () => {
                mockPrismaService.account.findFirst.mockResolvedValue({ type: "bank", currencyId: "cur-1" });
                mockPrismaService.transaction.count.mockResolvedValue(1);
                await expect(service.update("a1", "user-123", { type: "cash", currencyId: "cur-2" })).rejects.toThrow(
                    BadRequestException,
                );
                expect(mockPrismaService.transaction.count).toHaveBeenCalledWith({
                    where: { accountId: "a1", userId: "user-123", deletedAt: null, currencyId: { not: "cur-2" } },
                });
            });

            it("allows retyping when every transaction is already in the wallet's currency", async () => {
                mockPrismaService.account.findFirst.mockResolvedValue({ type: "bank", currencyId: "cur-1" });
                mockPrismaService.transaction.count.mockResolvedValue(0);
                mockPrismaService.account.update.mockResolvedValue(cashRow({ id: "a1" }));
                mockCashRows([]);
                mockCashRows([]);
                await service.update("a1", "user-123", { type: "cash" });
                expect(mockPrismaService.account.update).toHaveBeenCalled();
            });

            it("does not check transactions when the account is already cash", async () => {
                mockPrismaService.account.findFirst.mockResolvedValue({ type: "cash", currencyId: "cur-1" });
                mockPrismaService.account.update.mockResolvedValue(cashRow({ id: "a1" }));
                mockCashRows([]);
                mockCashRows([]);
                await service.update("a1", "user-123", { type: "cash" });
                expect(mockPrismaService.transaction.count).not.toHaveBeenCalled();
            });
        });

        it("should update an account", async () => {
            const userId = "user-123";
            const accountId = "account-123";
            const updateDto = { name: "Updated Name" };
            const existingAccount = {
                id: accountId,
                name: "Old Name",
                type: "bank",
                userId,
                balance: null,
                cardFrame: null,
                currency: null,
                createdAt: new Date(),
                updatedAt: new Date(),
                deletedAt: null,
            };
            const updatedRow = { ...existingAccount, ...updateDto };

            mockPrismaService.account.findFirst.mockResolvedValue(existingAccount);
            mockPrismaService.account.update.mockResolvedValue(updatedRow);

            const result = await service.update(accountId, userId, updateDto);

            expect(result).toEqual({
                ...updatedRow,
                hasLinkedTransfers: false,
                hasTransactions: false,
                lastTransactionDate: null,
            });
            expect(mockPrismaService.account.update).toHaveBeenCalledWith({
                where: { id: accountId },
                data: updateDto,
                include: { currency: true },
            });
        });

        it("converts a Decimal balance/cardFrame on the updated row to numbers", async () => {
            const userId = "user-123";
            const accountId = "account-123";
            const updateDto = { name: "Updated Name" };
            const existingAccount = {
                id: accountId,
                name: "Old Name",
                type: "credit_card",
                userId,
                balance: new Prisma.Decimal("-1234.56"),
                cardFrame: new Prisma.Decimal("10000"),
                currency: null,
                createdAt: new Date(),
                updatedAt: new Date(),
                deletedAt: null,
            };
            const updatedRow = { ...existingAccount, ...updateDto };

            mockPrismaService.account.findFirst.mockResolvedValue(existingAccount);
            mockPrismaService.account.update.mockResolvedValue(updatedRow);

            const result = await service.update(accountId, userId, updateDto);

            expect(result.balance).toBe(-1234.56);
            expect(typeof result.balance).toBe("number");
            expect(result.cardFrame).toBe(10000);
            expect(typeof result.cardFrame).toBe("number");
        });
    });

    describe("updateCashBalance", () => {
        const dto = (amount: number) => ({ amount, date: "2026-05-14" });
        const setup = (computed: number, balanceAfter: number) => {
            mockPrismaService.$transaction.mockImplementation((cb: (tx: unknown) => unknown) => cb(mockPrismaService));
            mockPrismaService.account.findFirst.mockResolvedValue(cashRow());
            mockPrismaService.account.update.mockResolvedValue(cashRow());
            mockPrismaService.transaction.create.mockResolvedValue({ id: "adj-1" });
            mockCashRows([group("cash-1", "income", null, computed)]);
            mockCashRows([group("cash-1", "income", null, balanceAfter)]);
        };

        it("records a shortfall as an uncategorized expense", async () => {
            setup(56.6, 20);
            const result = await service.updateCashBalance("cash-1", "user-123", dto(20));
            expect(mockPrismaService.transaction.create).toHaveBeenCalledWith({
                data: expect.objectContaining({
                    userId: "user-123",
                    accountId: "cash-1",
                    type: "expense",
                    amount: 36.6,
                    currencyId: "cur-1",
                    description: "Untracked cash spending",
                    transactionDate: new Date("2026-05-14"),
                    categoryId: null,
                }),
            });
            expect(result.adjustment).toEqual({ id: "adj-1", type: "expense", amount: 36.6 });
            expect(result.account.balance).toBe(20);
            expect(result.account.balanceKind).toBe("cash_on_hand");
        });

        it("records a surplus as a transfer in", async () => {
            setup(56.6, 100);
            const result = await service.updateCashBalance("cash-1", "user-123", dto(100));
            expect(mockPrismaService.transaction.create).toHaveBeenCalledWith({
                data: expect.objectContaining({
                    type: "transfer",
                    transferDirection: "in",
                    amount: 43.4,
                    description: "Cash adjustment",
                    categoryId: null,
                }),
            });
            expect(result.adjustment).toEqual({ id: "adj-1", type: "transfer", amount: 43.4 });
        });

        it("creates nothing when the balance already matches to the cent", async () => {
            setup(56.6000001, 56.6);
            const result = await service.updateCashBalance("cash-1", "user-123", dto(56.6));
            expect(mockPrismaService.transaction.create).not.toHaveBeenCalled();
            expect(result.adjustment).toBeNull();
        });

        describe("savings accounts", () => {
            const savingsRow = (over: Record<string, unknown> = {}) =>
                cashRow({ id: "sav-1", name: "Pot", type: "savings", ...over });
            const setupSavings = (computed: number, balanceAfter: number) => {
                mockPrismaService.$transaction.mockImplementation((cb: (tx: unknown) => unknown) =>
                    cb(mockPrismaService),
                );
                mockPrismaService.account.findFirst.mockResolvedValue(savingsRow());
                mockPrismaService.account.update.mockResolvedValue(savingsRow());
                mockPrismaService.transaction.create.mockResolvedValue({ id: "adj-1" });
                mockCashRows([group("sav-1", "income", null, computed)]);
                mockCashRows([group("sav-1", "income", null, balanceAfter)]);
            };

            it("records a rise as a transfer in", async () => {
                setupSavings(100, 150);
                const result = await service.updateCashBalance("sav-1", "user-123", dto(150));
                expect(mockPrismaService.transaction.create).toHaveBeenCalledWith({
                    data: expect.objectContaining({
                        accountId: "sav-1",
                        type: "transfer",
                        transferDirection: "in",
                        amount: 50,
                        description: "Savings adjustment",
                        categoryId: null,
                    }),
                });
                expect(result.adjustment).toEqual({ id: "adj-1", type: "transfer", amount: 50 });
                expect(result.account.balance).toBe(150);
                expect(result.account.balanceKind).toBe("account_balance");
            });

            it("records a drop as a transfer out, not an expense", async () => {
                setupSavings(100, 70);
                const result = await service.updateCashBalance("sav-1", "user-123", dto(70));
                expect(mockPrismaService.transaction.create).toHaveBeenCalledWith({
                    data: expect.objectContaining({
                        type: "transfer",
                        transferDirection: "out",
                        amount: 30,
                        description: "Savings adjustment",
                        categoryId: null,
                    }),
                });
                expect(result.adjustment).toEqual({ id: "adj-1", type: "transfer", amount: 30 });
            });

            it("creates nothing when the balance already matches", async () => {
                setupSavings(100, 100);
                const result = await service.updateCashBalance("sav-1", "user-123", dto(100));
                expect(mockPrismaService.transaction.create).not.toHaveBeenCalled();
                expect(result.adjustment).toBeNull();
                expect(result.account.balanceKind).toBe("account_balance");
            });

            it("rejects a savings account without a currency", async () => {
                mockPrismaService.$transaction.mockImplementation((cb: (tx: unknown) => unknown) =>
                    cb(mockPrismaService),
                );
                mockPrismaService.account.findFirst.mockResolvedValue(savingsRow({ currencyId: null }));
                await expect(service.updateCashBalance("sav-1", "user-123", dto(5))).rejects.toThrow(
                    "A savings account needs a currency",
                );
                expect(mockPrismaService.transaction.create).not.toHaveBeenCalled();
            });
        });

        it("rejects a non-ledger account", async () => {
            mockPrismaService.$transaction.mockImplementation((cb: (tx: unknown) => unknown) => cb(mockPrismaService));
            mockPrismaService.account.findFirst.mockResolvedValue(cashRow({ type: "bank" }));
            await expect(service.updateCashBalance("cash-1", "user-123", dto(5))).rejects.toThrow(
                "Only cash and savings accounts have a balance you can update",
            );
            expect(mockPrismaService.transaction.create).not.toHaveBeenCalled();
        });

        it("throws NotFound for a missing account", async () => {
            mockPrismaService.$transaction.mockImplementation((cb: (tx: unknown) => unknown) => cb(mockPrismaService));
            mockPrismaService.account.findFirst.mockResolvedValue(null);
            await expect(service.updateCashBalance("nope", "user-123", dto(5))).rejects.toThrow(NotFoundException);
        });
    });

    describe("remove", () => {
        it("rejects deleting a linked cash wallet", async () => {
            mockPrismaService.account.findFirst.mockResolvedValue(cashRow());
            mockCashRows([group("cash-1", "income", null, 5)], [{ accountId: "cash-1", _count: { _all: 1 } }]);
            await expect(service.remove("cash-1", "user-123")).rejects.toThrow(
                "This account has linked transfers. Revert or re-point them before deleting it.",
            );
            expect(mockPrismaService.account.update).not.toHaveBeenCalled();
        });

        it("rejects deleting a linked savings account", async () => {
            mockPrismaService.account.findFirst.mockResolvedValue(cashRow({ id: "sav-1", type: "savings" }));
            mockCashRows([group("sav-1", "income", null, 5)], [{ accountId: "sav-1", _count: { _all: 1 } }]);
            await expect(service.remove("sav-1", "user-123")).rejects.toThrow(
                "This account has linked transfers. Revert or re-point them before deleting it.",
            );
            expect(mockPrismaService.account.update).not.toHaveBeenCalled();
        });

        it("should soft delete an account", async () => {
            const userId = "user-123";
            const accountId = "account-123";
            const existingAccount = {
                id: accountId,
                name: "Test Account",
                type: "bank",
                userId,
                createdAt: new Date(),
                updatedAt: new Date(),
                deletedAt: null,
            };

            mockPrismaService.account.findFirst.mockResolvedValue(existingAccount);
            mockPrismaService.account.update.mockResolvedValue({
                ...existingAccount,
                deletedAt: new Date(),
            });

            await service.remove(accountId, userId);

            expect(mockPrismaService.account.update).toHaveBeenCalledWith({
                where: { id: accountId },
                data: { deletedAt: expect.any(Date) },
            });
        });
    });

    describe("upgradeUnknownAccountTypes", () => {
        it("reclassifies only rows still typed unknown, scoped to the user and not soft-deleted", async () => {
            mockPrismaService.account.updateMany.mockResolvedValue({ count: 2 });

            const result = await service.upgradeUnknownAccountTypes("user-123", ["1234", "5678"], "credit_card");

            expect(result).toBe(2);
            expect(mockPrismaService.account.updateMany).toHaveBeenCalledWith({
                where: {
                    userId: "user-123",
                    accountNumber: { in: ["1234", "5678"] },
                    // The predicate is a safety mechanism, not an optimization: it makes "never
                    // clobber a user-set type" a database guarantee.
                    type: "unknown",
                    deletedAt: null,
                },
                data: { type: "credit_card" },
            });
        });

        it("no-ops for an unrecognized provider (null type)", async () => {
            const result = await service.upgradeUnknownAccountTypes("user-123", ["1234"], null);

            expect(result).toBe(0);
            expect(mockPrismaService.account.updateMany).not.toHaveBeenCalled();
        });

        it("no-ops on an empty account list rather than emitting `{ in: [] }`", async () => {
            const result = await service.upgradeUnknownAccountTypes("user-123", [], "bank");

            expect(result).toBe(0);
            expect(mockPrismaService.account.updateMany).not.toHaveBeenCalled();
        });

        it("returns the count of rows actually reclassified", async () => {
            mockPrismaService.account.updateMany.mockResolvedValue({ count: 0 });

            expect(await service.upgradeUnknownAccountTypes("user-123", ["1234"], "bank")).toBe(0);
        });
    });
});
