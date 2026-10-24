import { Test, TestingModule } from "@nestjs/testing";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { TransactionsService } from "./transactions.service";
import { PrismaService } from "../prisma/prisma.service";
import { CardPayoffPatternsService } from "../card-payoff-patterns/card-payoff-patterns.service";
import { FxConversionService } from "./fx-conversion.service";
import { UpdateTransactionDto } from "./dto/update-transaction.dto";

describe("TransactionsService", () => {
    let service: TransactionsService;
    let prisma: PrismaService;

    const mockPrismaService = {
        transaction: {
            create: jest.fn(),
            findMany: jest.fn(),
            findFirst: jest.fn(),
            update: jest.fn(),
            updateMany: jest.fn(),
            count: jest.fn(),
            groupBy: jest.fn(),
            delete: jest.fn(),
            deleteMany: jest.fn(),
            findUniqueOrThrow: jest.fn(),
        },
        reimbursementAllocation: {
            deleteMany: jest.fn(),
            aggregate: jest.fn(),
            findMany: jest.fn(),
        },
        // Array form executes the batched operations; callback form runs against this same mock as the tx.
        $transaction: jest.fn((arg: unknown) =>
            typeof arg === "function" ? arg(mockPrismaService) : Promise.all(arg as Promise<unknown>[]),
        ),
        $executeRaw: jest.fn(),
        budget: {
            findMany: jest.fn(),
        },
        category: { findMany: jest.fn() },
        account: { findMany: jest.fn(), findFirst: jest.fn() },
        currency: { findMany: jest.fn(), findUnique: jest.fn() },
        transactionAttachment: {
            create: jest.fn(),
            findFirst: jest.fn(),
            update: jest.fn(),
        },
    };

    // The service re-reads the row it just wrote: resolve with whatever the latest create/update returned.
    mockPrismaService.transaction.findUniqueOrThrow.mockImplementation(() => {
        const { create, update } = mockPrismaService.transaction;
        const writes = [create, update].flatMap((fn) =>
            fn.mock.results.map((result, i) => ({ order: fn.mock.invocationCallOrder[i], value: result.value })),
        );
        writes.sort((a, b) => b.order - a.order);
        return writes[0]?.value;
    });

    const expectedInclude = {
        account: { include: { currency: true } },
        currency: true,
        originalCurrency: true,
        category: true,
        budget: true,
        attachments: { where: { deletedAt: null }, orderBy: { createdAt: "asc" } },
        counterpart: {
            select: {
                id: true,
                accountId: true,
                amount: true,
                currencyId: true,
                account: { select: { name: true, type: true } },
            },
        },
        counterpartOf: {
            select: { id: true, description: true, accountId: true, account: { select: { name: true } } },
        },
        reimbursedBy: {
            where: { income: { deletedAt: null } },
            select: {
                id: true,
                amount: true,
                income: {
                    select: {
                        id: true,
                        description: true,
                        amount: true,
                        transactionDate: true,
                        hidden: true,
                        deletedAt: true,
                        reimburses: { select: { amount: true } },
                    },
                },
            },
        },
        reimburses: {
            where: { expense: { deletedAt: null } },
            select: {
                id: true,
                amount: true,
                expense: {
                    select: {
                        id: true,
                        description: true,
                        amount: true,
                        transactionDate: true,
                        hidden: true,
                        deletedAt: true,
                        reimbursedBy: { select: { amount: true } },
                    },
                },
            },
        },
    };

    const mockCardPayoffPatternsService = {
        create: jest.fn(),
        applyPatternDescription: jest.fn(),
    };

    const mockFxConversionService = {
        snapshotTransactionConversion: jest.fn(),
    };

    const mockTransaction = {
        id: "transaction-id",
        userId: "test-user",
        accountId: "account-id",
        type: "expense",
        amount: 42.5,
        currencyId: "currency-id",
        description: "Starbucks Coffee",
        transactionDate: new Date("2025-12-14"),
        additionalDescription: "Grande latte",
        originalCategory: "Coffee & Restaurants",
        externalId: "TXN-001",
        postedDate: new Date("2025-12-16"),
        budgetId: "budget-id",
        categoryId: "category-id",
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        account: {
            id: "account-id",
            name: "Checking",
            type: "bank",
            balance: null,
            cardFrame: null,
            balanceKind: null,
            hasLinkedTransfers: false,
            hasTransactions: false,
            lastTransactionDate: null,
            currency: null,
        },
        currency: { id: "currency-id", code: "USD" },
        category: { id: "category-id", name: "Food" },
        budget: { id: "budget-id", name: "Monthly Budget" },
        attachments: [],
        counterpartOfId: null,
        counterpart: null,
        counterpartOf: null,
    };

    beforeEach(async () => {
        mockPrismaService.account.findFirst.mockResolvedValue({
            type: "bank",
            currencyId: "currency-id",
            currency: { code: "USD" },
        });
        mockPrismaService.reimbursementAllocation.findMany.mockResolvedValue([]);
        mockPrismaService.reimbursementAllocation.aggregate.mockResolvedValue({ _sum: { amount: null } });
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                TransactionsService,
                {
                    provide: PrismaService,
                    useValue: mockPrismaService,
                },
                {
                    provide: CardPayoffPatternsService,
                    useValue: mockCardPayoffPatternsService,
                },
                {
                    provide: FxConversionService,
                    useValue: mockFxConversionService,
                },
            ],
        }).compile();

        service = module.get<TransactionsService>(TransactionsService);
        prisma = module.get<PrismaService>(PrismaService);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe("create", () => {
        const baseDto = {
            accountId: "account-id",
            type: "expense",
            amount: 10,
            currencyId: "usd-id",
            description: "Coffee",
            transactionDate: "2025-12-14",
        };

        it("rejects a transaction whose currency differs from its cash account", async () => {
            mockPrismaService.account.findFirst.mockResolvedValue({
                type: "cash",
                currencyId: "ils-id",
                currency: { code: "ILS" },
            });
            await expect(service.create("test-user", baseDto)).rejects.toThrow(
                "Transactions on a cash account must be in its currency (ILS)",
            );
            expect(mockPrismaService.transaction.create).not.toHaveBeenCalled();
        });

        it("rejects a transaction whose currency differs from its savings account", async () => {
            mockPrismaService.account.findFirst.mockResolvedValue({
                type: "savings",
                currencyId: "ils-id",
                currency: { code: "ILS" },
            });
            await expect(service.create("test-user", baseDto)).rejects.toThrow(
                "Transactions on a savings account must be in its currency (ILS)",
            );
            expect(mockPrismaService.transaction.create).not.toHaveBeenCalled();
        });

        it("accepts a transaction in the cash account's currency", async () => {
            mockPrismaService.account.findFirst.mockResolvedValue({
                type: "cash",
                currencyId: "usd-id",
                currency: { code: "USD" },
            });
            mockPrismaService.transaction.create.mockResolvedValue(mockTransaction);
            mockPrismaService.budget.findMany.mockResolvedValue([]);
            await expect(service.create("test-user", baseDto)).resolves.toBeDefined();
        });

        it("rejects an account the user does not own", async () => {
            mockPrismaService.account.findFirst.mockResolvedValue(null);
            await expect(service.create("test-user", baseDto)).rejects.toThrow("Account not found");
            expect(mockPrismaService.transaction.create).not.toHaveBeenCalled();
        });

        it("should not pass counterpart fields into the Prisma create data", async () => {
            mockPrismaService.transaction.create.mockResolvedValue({
                ...mockTransaction,
                type: "transfer",
                transferDirection: "out",
            });
            mockPrismaService.account.findFirst.mockResolvedValue({
                id: "cash-account-id",
                type: "cash",
                currencyId: "currency-id",
            });
            mockPrismaService.budget.findMany.mockResolvedValue([]);

            await service.create("test-user", {
                accountId: "account-id",
                type: "transfer",
                transferDirection: "out",
                amount: 700,
                currencyId: "currency-id",
                description: "ATM",
                transactionDate: "2025-12-14",
                counterpartAccountId: "cash-account-id",
                counterpartAmount: 700,
            });

            const data = mockPrismaService.transaction.create.mock.calls[0][0].data;
            expect(data).not.toHaveProperty("counterpartAccountId");
            expect(data).not.toHaveProperty("counterpartAmount");
        });

        it("should flatten a counterpart in the response", async () => {
            mockPrismaService.transaction.create.mockResolvedValue({
                ...mockTransaction,
                counterpart: {
                    id: "mirror-id",
                    accountId: "cash-account-id",
                    amount: new Prisma.Decimal(700),
                    currencyId: "ils-id",
                    account: { name: "ILS Cash", type: "cash" },
                },
            });
            mockPrismaService.budget.findMany.mockResolvedValue([]);

            const result = await service.create("test-user", {
                accountId: "account-id",
                type: "transfer",
                amount: 700,
                currencyId: "currency-id",
                description: "ATM",
                transactionDate: "2025-12-14",
            });

            expect(result.counterpart).toEqual({
                id: "mirror-id",
                accountId: "cash-account-id",
                accountName: "ILS Cash",
                accountType: "cash",
                amount: 700,
                currencyId: "ils-id",
            });
            expect(result.counterpartOf).toBeNull();
            expect(result.counterpartOfId).toBeNull();
        });

        it("should reject a counterpart on a non-transfer", async () => {
            await expect(
                service.create("test-user", {
                    accountId: "account-id",
                    type: "expense",
                    amount: 10,
                    currencyId: "currency-id",
                    description: "Coffee",
                    transactionDate: "2025-12-14",
                    counterpartAccountId: "cash-account-id",
                }),
            ).rejects.toThrow(BadRequestException);
            expect(mockPrismaService.transaction.create).not.toHaveBeenCalled();
        });

        it("should create the source and its mirror in one transaction", async () => {
            mockPrismaService.transaction.create.mockResolvedValue({
                ...mockTransaction,
                type: "transfer",
                transferDirection: "out",
            });
            mockPrismaService.account.findFirst.mockResolvedValue({
                id: "cash-account-id",
                type: "cash",
                currencyId: "currency-id",
            });
            mockPrismaService.budget.findMany.mockResolvedValue([]);

            await service.create("test-user", {
                accountId: "account-id",
                type: "transfer",
                transferDirection: "out",
                amount: 42.5,
                currencyId: "currency-id",
                description: "ATM",
                transactionDate: "2025-12-14",
                counterpartAccountId: "cash-account-id",
            });

            expect(mockPrismaService.$transaction).toHaveBeenCalledTimes(1);
            expect(mockPrismaService.transaction.create).toHaveBeenCalledTimes(2);
            expect(mockPrismaService.transaction.create.mock.calls[1][0].data).toMatchObject({
                accountId: "cash-account-id",
                transferDirection: "in",
                amount: 42.5,
                counterpartOfId: "transaction-id",
            });
        });

        it("should persist notes and additionalDescription", async () => {
            const createDto = {
                accountId: "account-id",
                type: "expense",
                amount: 10,
                currencyId: "currency-id",
                description: "Coffee",
                transactionDate: "2025-12-14",
                additionalDescription: "Oat latte",
                notes: "Split with Dana",
            };

            mockPrismaService.transaction.create.mockResolvedValue(mockTransaction);
            mockPrismaService.budget.findMany.mockResolvedValue([]);

            await service.create("test-user", createDto);

            expect(mockPrismaService.transaction.create).toHaveBeenCalledWith({
                data: expect.objectContaining({
                    additionalDescription: "Oat latte",
                    notes: "Split with Dana",
                }),
            });
        });

        it("should create a transaction with date conversion", async () => {
            const createDto = {
                accountId: "account-id",
                type: "expense",
                amount: 42.5,
                currencyId: "currency-id",
                description: "Starbucks Coffee",
                transactionDate: "2025-12-14",
                postedDate: "2025-12-16",
            };

            mockPrismaService.transaction.create.mockResolvedValue(mockTransaction);
            mockPrismaService.budget.findMany.mockResolvedValue([{ currencyId: "eur-currency" }]);
            mockFxConversionService.snapshotTransactionConversion.mockResolvedValue(null);

            const result = await service.create("test-user", createDto);

            expect(result).toEqual({ ...mockTransaction, reimbursement: null });
            expect(mockPrismaService.transaction.create).toHaveBeenCalledWith({
                data: {
                    ...createDto,
                    userId: "test-user",
                    transactionDate: new Date(createDto.transactionDate),
                    postedDate: new Date(createDto.postedDate),
                },
            });

            expect(mockFxConversionService.snapshotTransactionConversion).toHaveBeenCalledWith({
                transactionId: "transaction-id",
                sourceCurrencyId: "currency-id",
                targetCurrencyId: "eur-currency",
                amount: 42.5,
                transactionDate: new Date("2025-12-14"),
            });
        });

        it("should create transaction without optional postedDate", async () => {
            const createDto = {
                accountId: "account-id",
                type: "income",
                amount: 1000,
                currencyId: "currency-id",
                description: "Salary",
                transactionDate: "2025-12-01",
            };

            mockPrismaService.transaction.create.mockResolvedValue({
                ...mockTransaction,
                postedDate: null,
            });
            mockPrismaService.budget.findMany.mockResolvedValue([]);

            await service.create("test-user", createDto);

            expect(mockPrismaService.transaction.create).toHaveBeenCalledWith({
                data: expect.objectContaining({
                    postedDate: null,
                }),
            });
        });
    });

    describe("findAll", () => {
        it("should return all transactions without filters", async () => {
            mockPrismaService.transaction.findMany.mockResolvedValue([mockTransaction]);

            const result = await service.findAll("test-user");

            expect(result).toEqual([{ ...mockTransaction, reimbursement: null }]);
            expect(mockPrismaService.transaction.findMany).toHaveBeenCalledWith({
                where: {
                    userId: "test-user",
                    deletedAt: null,
                },
                include: expectedInclude,
                orderBy: { transactionDate: "desc" },
            });
        });

        it("should filter by accountId", async () => {
            mockPrismaService.transaction.findMany.mockResolvedValue([mockTransaction]);

            await service.findAll("test-user", { accountId: "account-id" });

            expect(mockPrismaService.transaction.findMany).toHaveBeenCalledWith({
                where: {
                    userId: "test-user",
                    deletedAt: null,
                    accountId: "account-id",
                },
                include: expect.any(Object),
                orderBy: expect.any(Object),
            });
        });

        it("should filter by date range", async () => {
            mockPrismaService.transaction.findMany.mockResolvedValue([mockTransaction]);

            await service.findAll("test-user", {
                startDate: "2025-01-01",
                endDate: "2025-12-31",
            });

            expect(mockPrismaService.transaction.findMany).toHaveBeenCalledWith({
                where: {
                    userId: "test-user",
                    deletedAt: null,
                    transactionDate: {
                        gte: new Date("2025-01-01"),
                        lte: new Date("2025-12-31"),
                    },
                },
                include: expect.any(Object),
                orderBy: expect.any(Object),
            });
        });

        it("should filter by type", async () => {
            mockPrismaService.transaction.findMany.mockResolvedValue([mockTransaction]);

            await service.findAll("test-user", { type: "expense" });

            expect(mockPrismaService.transaction.findMany).toHaveBeenCalledWith({
                where: {
                    userId: "test-user",
                    deletedAt: null,
                    type: "expense",
                },
                include: expect.any(Object),
                orderBy: expect.any(Object),
            });
        });

        it("should filter by multiple criteria", async () => {
            mockPrismaService.transaction.findMany.mockResolvedValue([mockTransaction]);

            await service.findAll("test-user", {
                accountId: "account-id",
                categoryId: "category-id",
                type: "expense",
                startDate: "2025-12-01",
                endDate: "2025-12-31",
            });

            expect(mockPrismaService.transaction.findMany).toHaveBeenCalledWith({
                where: {
                    userId: "test-user",
                    deletedAt: null,
                    accountId: "account-id",
                    categoryId: "category-id",
                    type: "expense",
                    transactionDate: {
                        gte: new Date("2025-12-01"),
                        lte: new Date("2025-12-31"),
                    },
                },
                include: expect.any(Object),
                orderBy: expect.any(Object),
            });
        });
    });

    describe("findAll — list filters (no pagination)", () => {
        beforeEach(() => {
            mockPrismaService.transaction.findMany.mockResolvedValue([mockTransaction]);
        });

        it("should build a case-insensitive OR search across description, additionalDescription and category name", async () => {
            await service.findAll("test-user", { search: "coffee" });

            expect(mockPrismaService.transaction.findMany).toHaveBeenCalledWith({
                where: {
                    userId: "test-user",
                    deletedAt: null,
                    AND: [
                        {
                            OR: [
                                { description: { contains: "coffee", mode: "insensitive" } },
                                { additionalDescription: { contains: "coffee", mode: "insensitive" } },
                                { category: { name: { contains: "coffee", mode: "insensitive" } } },
                            ],
                        },
                    ],
                },
                include: expectedInclude,
                orderBy: { transactionDate: "desc" },
            });
        });

        it("should filter categoryIds with an `in` clause", async () => {
            await service.findAll("test-user", { categoryIds: ["cat-1", "cat-2"] });

            expect(mockPrismaService.transaction.findMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: {
                        userId: "test-user",
                        deletedAt: null,
                        AND: [{ OR: [{ categoryId: { in: ["cat-1", "cat-2"] } }] }],
                    },
                }),
            );
        });

        it("should treat the `uncategorized` sentinel as categoryId null, OR-ed with real ids", async () => {
            await service.findAll("test-user", { categoryIds: ["cat-1", "uncategorized"] });

            expect(mockPrismaService.transaction.findMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: {
                        userId: "test-user",
                        deletedAt: null,
                        AND: [{ OR: [{ categoryId: { in: ["cat-1"] } }, { categoryId: null }] }],
                    },
                }),
            );
        });

        it("should support `uncategorized` alone", async () => {
            await service.findAll("test-user", { categoryIds: ["uncategorized"] });

            expect(mockPrismaService.transaction.findMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: {
                        userId: "test-user",
                        deletedAt: null,
                        AND: [{ OR: [{ categoryId: null }] }],
                    },
                }),
            );
        });

        it("should combine categoryIds and search under AND without clobbering", async () => {
            await service.findAll("test-user", { categoryIds: ["cat-1"], search: "rent" });

            expect(mockPrismaService.transaction.findMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: {
                        userId: "test-user",
                        deletedAt: null,
                        AND: [
                            { OR: [{ categoryId: { in: ["cat-1"] } }] },
                            {
                                OR: [
                                    { description: { contains: "rent", mode: "insensitive" } },
                                    { additionalDescription: { contains: "rent", mode: "insensitive" } },
                                    { category: { name: { contains: "rent", mode: "insensitive" } } },
                                ],
                            },
                        ],
                    },
                }),
            );
        });

        it("should filter out hidden transactions only when includeHidden is explicitly false", async () => {
            await service.findAll("test-user", { includeHidden: false });

            expect(mockPrismaService.transaction.findMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { userId: "test-user", deletedAt: null, hidden: false },
                }),
            );
        });

        it("should NOT add a hidden filter when includeHidden is true", async () => {
            await service.findAll("test-user", { includeHidden: true });

            const where = mockPrismaService.transaction.findMany.mock.calls[0][0].where;
            expect(where).not.toHaveProperty("hidden");
        });

        it("should NOT add a hidden filter when includeHidden is absent (legacy)", async () => {
            await service.findAll("test-user", { type: "expense" });

            const where = mockPrismaService.transaction.findMany.mock.calls[0][0].where;
            expect(where).not.toHaveProperty("hidden");
        });

        it("should produce byte-identical legacy findMany args and return an array (no page)", async () => {
            const result = await service.findAll("test-user", {
                accountId: "account-id",
                categoryId: "category-id",
                type: "expense",
                startDate: "2025-12-01",
                endDate: "2025-12-31",
            });

            expect(result).toEqual([{ ...mockTransaction, reimbursement: null }]);
            expect(mockPrismaService.transaction.findMany).toHaveBeenCalledWith({
                where: {
                    userId: "test-user",
                    deletedAt: null,
                    accountId: "account-id",
                    categoryId: "category-id",
                    type: "expense",
                    transactionDate: {
                        gte: new Date("2025-12-01"),
                        lte: new Date("2025-12-31"),
                    },
                },
                include: expectedInclude,
                orderBy: { transactionDate: "desc" },
            });
            // Legacy branch must not touch the paginated code paths.
            expect(mockPrismaService.transaction.count).not.toHaveBeenCalled();
            expect(mockPrismaService.$transaction).not.toHaveBeenCalled();
        });
    });

    describe("findAll — paginated", () => {
        beforeEach(() => {
            mockPrismaService.transaction.findMany.mockResolvedValue([mockTransaction]);
            mockPrismaService.transaction.count.mockResolvedValue(7);
        });

        it("should return the paginated envelope with correct skip/take and totalPages ceil", async () => {
            const result = await service.findAll("test-user", { page: 2, limit: 3 });

            expect(result).toEqual({
                data: [{ ...mockTransaction, reimbursement: null }],
                total: 7,
                page: 2,
                pageSize: 3,
                totalPages: 3, // ceil(7 / 3)
            });

            expect(mockPrismaService.$transaction).toHaveBeenCalledTimes(1);
            expect(mockPrismaService.transaction.findMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    skip: 3, // (2 - 1) * 3
                    take: 3,
                    include: expectedInclude,
                }),
            );
            expect(mockPrismaService.transaction.count).toHaveBeenCalledWith(
                expect.objectContaining({ where: expect.objectContaining({ userId: "test-user", deletedAt: null }) }),
            );
        });

        it("should default limit to 50 and orderBy to transactionDate desc with an id tiebreaker", async () => {
            await service.findAll("test-user", { page: 1 });

            expect(mockPrismaService.transaction.findMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    skip: 0,
                    take: 50,
                    orderBy: [{ transactionDate: "desc" }, { id: "desc" }],
                }),
            );
        });

        it("should map sortBy / sortOrder into the primary orderBy, keeping the id tiebreaker", async () => {
            await service.findAll("test-user", { page: 1, sortBy: "amount", sortOrder: "asc" });

            expect(mockPrismaService.transaction.findMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    orderBy: [{ amount: "asc" }, { id: "desc" }],
                }),
            );
        });

        it("should apply the same where clause to both findMany and count", async () => {
            await service.findAll("test-user", { page: 1, type: "expense", includeHidden: false });

            const expectedWhere = { userId: "test-user", deletedAt: null, type: "expense", hidden: false };
            expect(mockPrismaService.transaction.findMany).toHaveBeenCalledWith(
                expect.objectContaining({ where: expectedWhere }),
            );
            expect(mockPrismaService.transaction.count).toHaveBeenCalledWith({ where: expectedWhere });
        });
    });

    describe("getSummary", () => {
        // Mimics a Prisma Decimal: an object carrying toNumber()/toString(),
        // never a plain JS number, so the service must convert explicitly.
        const decimal = (n: number) => ({
            toNumber: () => n,
            toString: () => String(n),
        });

        // income 1000, expense 300, transfer-in 200, transfer-out 50,
        // transfer null-direction 25 (counts as out).
        const buckets = [
            { type: "income", transferDirection: null, _sum: { amount: decimal(1000) }, _count: { _all: 3 } },
            { type: "expense", transferDirection: null, _sum: { amount: decimal(300) }, _count: { _all: 5 } },
            { type: "transfer", transferDirection: "in", _sum: { amount: decimal(200) }, _count: { _all: 2 } },
            { type: "transfer", transferDirection: "out", _sum: { amount: decimal(50) }, _count: { _all: 1 } },
            { type: "transfer", transferDirection: null, _sum: { amount: decimal(25) }, _count: { _all: 1 } },
        ];

        it("should compute the 5 metrics (null-direction transfer counts as out) and total count", async () => {
            mockPrismaService.transaction.groupBy.mockResolvedValueOnce(buckets).mockResolvedValueOnce([]);
            mockPrismaService.transaction.findFirst.mockResolvedValue({ currency: { code: "USD" } });

            const result = await service.getSummary("test-user", {});

            // transferred = -200 (in) + 50 (out) + 25 (null → out) = -125
            // net = 1000 - 300 = 700; available = 700 - (-125) = 825
            expect(result).toEqual({
                income: 1000,
                expenses: 300,
                net: 700,
                transferred: -125,
                available: 825,
                count: 12, // 3 + 5 + 2 + 1 + 1
                currencyCode: "USD",
            });
        });

        it("should always force where.hidden === false regardless of input filters", async () => {
            mockPrismaService.transaction.groupBy.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
            mockPrismaService.transaction.findFirst.mockResolvedValue(null);

            // Even though the caller never passes includeHidden (the DTO omits
            // it), assert the summary forces hidden: false on both queries.
            await service.getSummary("test-user", { type: "expense" });

            const groupByArgs = mockPrismaService.transaction.groupBy.mock.calls[0][0];
            expect(groupByArgs.where.hidden).toBe(false);
            expect(groupByArgs).toEqual(
                expect.objectContaining({
                    by: ["type", "transferDirection"],
                    _sum: { amount: true },
                    _count: { _all: true },
                }),
            );
            const findFirstArgs = mockPrismaService.transaction.findFirst.mock.calls[0][0];
            expect(findFirstArgs.where.hidden).toBe(false);
        });

        it("should pass list filters through buildListWhere into the groupBy where", async () => {
            mockPrismaService.transaction.groupBy.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
            mockPrismaService.transaction.findFirst.mockResolvedValue(null);

            await service.getSummary("test-user", {
                type: "expense",
                categoryIds: ["cat-1", "uncategorized"],
                search: "coffee",
                startDate: "2025-12-01",
                endDate: "2025-12-31",
            });

            expect(mockPrismaService.transaction.groupBy).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: {
                        userId: "test-user",
                        deletedAt: null,
                        hidden: false,
                        type: "expense",
                        transactionDate: {
                            gte: new Date("2025-12-01"),
                            lte: new Date("2025-12-31"),
                        },
                        AND: [
                            { OR: [{ categoryId: { in: ["cat-1"] } }, { categoryId: null }] },
                            {
                                OR: [
                                    { description: { contains: "coffee", mode: "insensitive" } },
                                    { additionalDescription: { contains: "coffee", mode: "insensitive" } },
                                    { category: { name: { contains: "coffee", mode: "insensitive" } } },
                                ],
                            },
                        ],
                    },
                }),
            );
        });

        it("should look up currencyCode from the most recent matching transaction using the same where", async () => {
            mockPrismaService.transaction.groupBy.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
            mockPrismaService.transaction.findFirst.mockResolvedValue({ currency: { code: "EUR" } });

            const result = await service.getSummary("test-user", { type: "income" });

            expect(result.currencyCode).toBe("EUR");
            expect(mockPrismaService.transaction.findFirst).toHaveBeenCalledWith({
                where: { userId: "test-user", deletedAt: null, hidden: false, type: "income" },
                orderBy: { transactionDate: "desc" },
                select: { currency: { select: { code: true } } },
            });
        });

        it("should fall back to ILS and zeroed metrics when there are no matching transactions", async () => {
            mockPrismaService.transaction.groupBy.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
            mockPrismaService.transaction.findFirst.mockResolvedValue(null);

            const result = await service.getSummary("test-user", {});

            expect(result).toEqual({
                income: 0,
                expenses: 0,
                net: 0,
                transferred: 0,
                available: 0,
                count: 0,
                currencyCode: "ILS",
            });
        });

        it("should treat a null bucket sum (empty aggregate) as 0 without arithmetic on Decimal", async () => {
            mockPrismaService.transaction.groupBy
                .mockResolvedValueOnce([
                    { type: "income", transferDirection: null, _sum: { amount: null }, _count: { _all: 0 } },
                    { type: "expense", transferDirection: null, _sum: { amount: decimal(42.5) }, _count: { _all: 2 } },
                ])
                .mockResolvedValueOnce([]);
            mockPrismaService.transaction.findFirst.mockResolvedValue({ currency: { code: "ILS" } });

            const result = await service.getSummary("test-user", {});

            expect(result.income).toBe(0);
            expect(result.expenses).toBe(42.5);
            expect(result.net).toBe(-42.5);
            expect(result.count).toBe(2);
        });

        describe("reimbursement netting", () => {
            // The expense-side query filters `expense.AND`; the income-side query's `expense` is plain ACTIVE_SIDE.
            const sideOf = (args: { where: { expense: object } }) =>
                "AND" in args.where.expense ? "expense" : "income";
            const mockAllocationSums = (expenseSide: number, incomeSide: number) =>
                mockPrismaService.reimbursementAllocation.aggregate.mockImplementation(({ where }) =>
                    Promise.resolve({
                        _sum: { amount: decimal(sideOf({ where }) === "expense" ? expenseSide : incomeSide) },
                    }),
                );

            it("subtracts the active reimbursements from expenses", async () => {
                mockPrismaService.transaction.groupBy
                    .mockResolvedValueOnce([
                        {
                            type: "expense",
                            transferDirection: null,
                            _sum: { amount: decimal(600) },
                            _count: { _all: 2 },
                        },
                    ])
                    .mockResolvedValueOnce([]);
                mockPrismaService.transaction.findFirst.mockResolvedValue(null);
                mockAllocationSums(300, 0);

                const result = await service.getSummary("test-user", {});

                expect(result).toMatchObject({ income: 0, expenses: 300, net: -300, count: 2 });
            });

            it("subtracts the allocated part from income and keeps the remainder", async () => {
                mockPrismaService.transaction.groupBy
                    .mockResolvedValueOnce([
                        {
                            type: "income",
                            transferDirection: null,
                            _sum: { amount: decimal(350) },
                            _count: { _all: 1 },
                        },
                    ])
                    .mockResolvedValueOnce([]);
                mockPrismaService.transaction.findFirst.mockResolvedValue(null);
                mockAllocationSums(0, 300);

                const result = await service.getSummary("test-user", {});

                expect(result).toMatchObject({ income: 50, expenses: 0, net: 50, count: 1 });
            });

            it("scopes both allocation queries by the row filters and keeps a type filter from widening them", async () => {
                mockPrismaService.transaction.groupBy.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
                mockPrismaService.transaction.findFirst.mockResolvedValue(null);

                await service.getSummary("test-user", { type: "income", categoryIds: ["cat-1"] });

                const calls = mockPrismaService.reimbursementAllocation.aggregate.mock.calls.map(([args]) => args);
                const expenseSide = calls.find((args) => sideOf(args) === "expense");
                const incomeSide = calls.find((args) => sideOf(args) === "income");
                // The expense side ANDs the row filters with type expense: the caller's type income can only narrow it to nothing.
                expect(expenseSide.where.expense.AND).toEqual([
                    expect.objectContaining({ userId: "test-user", hidden: false, type: "income" }),
                    { type: "expense" },
                ]);
                expect(expenseSide.where.income).toEqual({ deletedAt: null, hidden: false });
                expect(incomeSide.where.income.AND).toEqual([
                    expect.objectContaining({ userId: "test-user", hidden: false, type: "income" }),
                    { type: "income" },
                ]);
                expect(incomeSide.where.expense).toEqual({ deletedAt: null, hidden: false });
            });
        });

        describe("linked transfer legs", () => {
            const group = (type: string, dir: string | null, n: number, c = 1) => ({
                type,
                transferDirection: dir,
                _sum: { amount: decimal(n) },
                _count: { _all: c },
            });
            const linkedBucket = (dir: string, n: number) => ({ transferDirection: dir, _sum: { amount: decimal(n) } });

            it("should keep a same-currency linked pair neutral without an account filter", async () => {
                mockPrismaService.transaction.groupBy
                    .mockResolvedValueOnce([
                        group("transfer", "out", 700),
                        group("transfer", "in", 700),
                        group("expense", null, 643.4),
                    ])
                    .mockResolvedValueOnce([linkedBucket("out", 700), linkedBucket("in", 700)]);
                mockPrismaService.transaction.findFirst.mockResolvedValue(null);

                const result = await service.getSummary("test-user", {});

                expect(result.transferred).toBe(0);
                expect(result.expenses).toBe(643.4);
                expect(result.available).toBe(-643.4);
            });

            it("should not let a cross-currency linked pair distort transferred", async () => {
                mockPrismaService.transaction.groupBy
                    .mockResolvedValueOnce([group("transfer", "out", 370), group("transfer", "in", 100)])
                    .mockResolvedValueOnce([linkedBucket("out", 370), linkedBucket("in", 100)]);
                mockPrismaService.transaction.findFirst.mockResolvedValue(null);

                const result = await service.getSummary("test-user", {});

                expect(result.transferred).toBe(0);
            });

            it("should skip the linked query and count legs when filtering by account", async () => {
                mockPrismaService.transaction.groupBy.mockResolvedValueOnce([group("transfer", "out", 370)]);
                mockPrismaService.transaction.findFirst.mockResolvedValue(null);

                const result = await service.getSummary("test-user", { accountId: "acc-1" });

                expect(mockPrismaService.transaction.groupBy).toHaveBeenCalledTimes(1);
                expect(result.transferred).toBe(370);
            });

            it("should keep the type filter and restrict linked legs to transfers via AND", async () => {
                mockPrismaService.transaction.groupBy.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
                mockPrismaService.transaction.findFirst.mockResolvedValue(null);

                const result = await service.getSummary("test-user", { type: "expense" });

                // where.type stays "expense", so the type=transfer AND clause matches nothing
                // and cross-currency linked legs cannot distort `transferred`.
                const linkedArgs = mockPrismaService.transaction.groupBy.mock.calls[1][0];
                expect(linkedArgs.where.type).toBe("expense");
                expect(linkedArgs.where.AND).toContainEqual({ type: "transfer" });
                expect(result.transferred).toBe(0);
            });

            it("should filter the linked query on the counterpart relations", async () => {
                mockPrismaService.transaction.groupBy.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
                mockPrismaService.transaction.findFirst.mockResolvedValue(null);

                await service.getSummary("test-user", {});

                const linkedArgs = mockPrismaService.transaction.groupBy.mock.calls[1][0];
                expect(linkedArgs.by).toEqual(["transferDirection"]);
                expect(linkedArgs.where.AND).toContainEqual({ type: "transfer" });
                expect(linkedArgs.where.AND).toContainEqual({
                    OR: [{ counterpartOfId: { not: null } }, { counterpart: { isNot: null } }],
                });
            });
        });
    });

    describe("findOne", () => {
        it("should return a transaction by id with applicable budgets", async () => {
            mockPrismaService.transaction.findFirst.mockResolvedValue(mockTransaction);
            mockPrismaService.budget.findMany.mockResolvedValue([
                {
                    id: "budget-id",
                    name: "Monthly Budget",
                    period: "monthly",
                    budgetCategories: [{ categoryId: "category-id" }, { categoryId: "other-category-id" }],
                },
            ]);

            const result = await service.findOne("transaction-id", "test-user");

            expect(result).toEqual({
                ...mockTransaction,
                reimbursement: null,
                applicableBudgets: [
                    {
                        id: "budget-id",
                        name: "Monthly Budget",
                        period: "monthly",
                        categoryIds: ["category-id", "other-category-id"],
                    },
                ],
            });
            expect(mockPrismaService.transaction.findFirst).toHaveBeenCalledWith({
                where: {
                    id: "transaction-id",
                    userId: "test-user",
                    deletedAt: null,
                },
                include: expectedInclude,
            });
        });

        it("converts the nested account's Decimal balance/cardFrame to numbers", async () => {
            mockPrismaService.transaction.findFirst.mockResolvedValue({
                ...mockTransaction,
                account: {
                    id: "account-id",
                    name: "Checking",
                    type: "credit_card",
                    balance: new Prisma.Decimal("-1234.56"),
                    cardFrame: new Prisma.Decimal("10000"),
                    balanceKind: "utilized_credit",
                    currency: null,
                },
            });
            mockPrismaService.budget.findMany.mockResolvedValue([]);

            const result = await service.findOne("transaction-id", "test-user");

            expect(result.account.balance).toBe(-1234.56);
            expect(typeof result.account.balance).toBe("number");
            expect(result.account.cardFrame).toBe(10000);
            expect(typeof result.account.cardFrame).toBe("number");
        });

        it("should match budgets by category link within the lifecycle window and by direct link", async () => {
            mockPrismaService.transaction.findFirst.mockResolvedValue(mockTransaction);
            mockPrismaService.budget.findMany.mockResolvedValue([]);

            await service.findOne("transaction-id", "test-user");

            expect(mockPrismaService.budget.findMany).toHaveBeenCalledWith({
                where: {
                    userId: "test-user",
                    deletedAt: null,
                    OR: [
                        {
                            budgetCategories: { some: { categoryId: "category-id" } },
                            startDate: { lte: mockTransaction.transactionDate },
                            OR: [{ endDate: null }, { endDate: { gte: mockTransaction.transactionDate } }],
                        },
                        { id: "budget-id" },
                    ],
                },
                include: { budgetCategories: true },
                orderBy: { createdAt: "asc" },
            });
        });

        it("returns the reimbursement summary from the expense's point of view for one income link", async () => {
            mockPrismaService.transaction.findFirst.mockResolvedValue({
                ...mockTransaction,
                amount: 100,
                reimbursedBy: [
                    {
                        id: "allocation-1",
                        amount: 40,
                        income: {
                            id: "income-1",
                            description: "Work refund",
                            amount: 60,
                            transactionDate: new Date("2025-12-20"),
                            hidden: false,
                            deletedAt: null,
                            reimburses: [{ amount: 40 }],
                        },
                    },
                ],
                reimburses: [],
            });
            mockPrismaService.budget.findMany.mockResolvedValue([]);

            const result = await service.findOne("transaction-id", "test-user");

            expect(result.reimbursement).toEqual({
                role: "expense",
                allocatedTotal: 40,
                allocatedActive: 40,
                links: [
                    {
                        allocationId: "allocation-1",
                        transactionId: "income-1",
                        description: "Work refund",
                        transactionAmount: 60,
                        // Income 60 minus its only allocation (40) leaves 20.
                        transactionRemaining: 20,
                        transactionDate: new Date("2025-12-20"),
                        amount: 40,
                        active: true,
                    },
                ],
            });
            expect(result).not.toHaveProperty("reimbursedBy");
            expect(result).not.toHaveProperty("reimburses");
        });

        it("should not compute applicable budgets for non-expense transactions", async () => {
            mockPrismaService.transaction.findFirst.mockResolvedValue({
                ...mockTransaction,
                type: "income",
            });

            const result = await service.findOne("transaction-id", "test-user");

            expect(result.applicableBudgets).toEqual([]);
            expect(mockPrismaService.budget.findMany).not.toHaveBeenCalled();
        });

        it("should not return applicable budgets for a hidden expense", async () => {
            mockPrismaService.transaction.findFirst.mockResolvedValue({
                ...mockTransaction,
                hidden: true,
            });

            const result = await service.findOne("transaction-id", "test-user");

            expect(result.applicableBudgets).toEqual([]);
            expect(mockPrismaService.budget.findMany).not.toHaveBeenCalled();
        });

        it("should still return applicable budgets for a visible expense", async () => {
            mockPrismaService.transaction.findFirst.mockResolvedValue({
                ...mockTransaction,
                hidden: false,
            });
            mockPrismaService.budget.findMany.mockResolvedValue([
                {
                    id: "budget-id",
                    name: "Monthly Budget",
                    period: "monthly",
                    budgetCategories: [{ categoryId: "category-id" }],
                },
            ]);

            const result = await service.findOne("transaction-id", "test-user");

            expect(result.applicableBudgets).toEqual([
                { id: "budget-id", name: "Monthly Budget", period: "monthly", categoryIds: ["category-id"] },
            ]);
            expect(mockPrismaService.budget.findMany).toHaveBeenCalled();
        });

        it("should return empty applicable budgets when transaction has no category or budget", async () => {
            mockPrismaService.transaction.findFirst.mockResolvedValue({
                ...mockTransaction,
                categoryId: null,
                budgetId: null,
            });

            const result = await service.findOne("transaction-id", "test-user");

            expect(result.applicableBudgets).toEqual([]);
            expect(mockPrismaService.budget.findMany).not.toHaveBeenCalled();
        });

        it("should throw NotFoundException if transaction not found", async () => {
            mockPrismaService.transaction.findFirst.mockResolvedValue(null);

            await expect(service.findOne("non-existent", "test-user")).rejects.toThrow(NotFoundException);
        });
    });

    describe("searchLean", () => {
        const leanRow = {
            id: "t1",
            transactionDate: new Date("2025-01-02"),
            postedDate: null,
            type: "expense",
            transferDirection: null,
            amount: new Prisma.Decimal("12.50"),
            originalAmount: null,
            description: "Coffee",
            additionalDescription: null,
            notes: null,
            hidden: false,
            paymentType: null,
            originalCategory: null,
            categoryId: "c1",
            accountId: "a1",
            budgetId: null,
            currency: { code: "ILS" },
            originalCurrency: null,
            category: { name: "Food" },
            account: { name: "Main" },
            budget: null,
        };

        it("scopes by user, uses select, tiebreaker and skip/take, and maps rows", async () => {
            mockPrismaService.transaction.findMany.mockResolvedValue([
                { ...leanRow, originalAmount: new Prisma.Decimal("3.25"), originalCurrency: { code: "USD" } },
            ]);
            mockPrismaService.transaction.count.mockResolvedValue(7);

            const result = await service.searchLean("u1", { page: 9, limit: 99 }, { skip: 20, take: 10 });

            const args = mockPrismaService.transaction.findMany.mock.calls[0][0];
            expect(args.where).toEqual({ userId: "u1", deletedAt: null });
            expect(args.include).toBeUndefined();
            expect(args.select.currency).toEqual({ select: { code: true } });
            expect(args.orderBy).toEqual([{ transactionDate: "desc" }, { id: "desc" }]);
            expect(args.skip).toBe(20);
            expect(args.take).toBe(10);
            expect(mockPrismaService.transaction.count).toHaveBeenCalledWith({ where: args.where });
            expect(result.totalCount).toBe(7);
            expect(result.rows[0]).toMatchObject({
                id: "t1",
                amount: 12.5,
                originalAmount: 3.25,
                originalCurrencyCode: "USD",
                currencyCode: "ILS",
                categoryName: "Food",
                accountName: "Main",
                budgetName: null,
            });
        });

        it("keeps originalAmount null when null", async () => {
            mockPrismaService.transaction.findMany.mockResolvedValue([leanRow]);
            mockPrismaService.transaction.count.mockResolvedValue(1);
            const result = await service.searchLean("u1", {}, { skip: 0, take: 5 });
            expect(result.rows[0].originalAmount).toBeNull();
            expect(result.rows[0].originalCurrencyCode).toBeNull();
        });

        it("applies includeHidden false, categoryIds with uncategorized, search and sort", async () => {
            mockPrismaService.transaction.findMany.mockResolvedValue([]);
            mockPrismaService.transaction.count.mockResolvedValue(0);

            await service.searchLean(
                "u1",
                {
                    includeHidden: false,
                    categoryIds: ["c1", "uncategorized"],
                    search: "cof",
                    sortBy: "amount",
                    sortOrder: "asc",
                },
                { skip: 0, take: 5 },
            );

            const args = mockPrismaService.transaction.findMany.mock.calls[0][0];
            expect(args.where.hidden).toBe(false);
            expect(args.where.AND[0]).toEqual({ OR: [{ categoryId: { in: ["c1"] } }, { categoryId: null }] });
            expect(args.where.AND[1].OR[0]).toEqual({ description: { contains: "cof", mode: "insensitive" } });
            expect(args.orderBy).toEqual([{ amount: "asc" }, { id: "desc" }]);
        });

        it("netAmount nets expenses and incomes by their active links, and keeps hidden rows and transfers gross", async () => {
            const link = (n: string) => ({ amount: new Prisma.Decimal(n) });
            mockPrismaService.transaction.findMany.mockResolvedValue([
                { ...leanRow, id: "exp", amount: new Prisma.Decimal("600"), reimbursedBy: [link("150"), link("150")] },
                { ...leanRow, id: "inc", type: "income", amount: new Prisma.Decimal("350"), reimburses: [link("300")] },
                { ...leanRow, id: "hid", hidden: true, amount: new Prisma.Decimal("600"), reimbursedBy: [link("150")] },
                {
                    ...leanRow,
                    id: "xfer",
                    type: "transfer",
                    amount: new Prisma.Decimal("80"),
                    reimbursedBy: [link("150")],
                },
            ]);
            mockPrismaService.transaction.count.mockResolvedValue(4);

            const result = await service.searchLean("u1", {}, { skip: 0, take: 10 });

            expect(result.rows.map((r) => [r.id, r.amount, r.netAmount])).toEqual([
                ["exp", 600, 300],
                ["inc", 350, 50],
                ["hid", 600, 600],
                ["xfer", 80, 80],
            ]);
            const args = mockPrismaService.transaction.findMany.mock.calls[0][0];
            expect(args.select.reimbursedBy).toEqual({
                where: { income: { deletedAt: null, hidden: false } },
                select: { amount: true },
            });
            expect(args.select.reimburses).toEqual({
                where: { expense: { deletedAt: null, hidden: false } },
                select: { amount: true },
            });
        });
    });

    describe("aggregate", () => {
        const filters = { startDate: "2025-01-01" };

        beforeEach(() => {
            mockPrismaService.currency.findMany.mockResolvedValue([
                { id: "cur-ils", code: "ILS" },
                { id: "cur-usd", code: "USD" },
            ]);
        });

        it.each([
            ["month", "transactionDate"],
            ["category", "categoryId"],
            ["merchant", "description"],
            ["account", "accountId"],
        ] as const)("groups %s by %s", async (groupBy, field) => {
            mockPrismaService.transaction.groupBy.mockResolvedValue([]);
            await service.aggregate("u1", filters, groupBy);
            const args = mockPrismaService.transaction.groupBy.mock.calls[0][0];
            expect(args.by).toEqual([field, "type", "transferDirection", "currencyId"]);
            expect(args.where.userId).toBe("u1");
            expect(args.where.deletedAt).toBeNull();
        });

        it("merges dates in the same month and keeps type and currency separate", async () => {
            const g = (date: string, type: string, cur: string, sum: string, n: number) => ({
                transactionDate: new Date(date),
                type,
                transferDirection: null,
                currencyId: cur,
                _sum: { amount: new Prisma.Decimal(sum) },
                _count: { _all: n },
            });
            mockPrismaService.transaction.groupBy.mockResolvedValue([
                g("2025-01-03", "expense", "cur-ils", "10.10", 1),
                g("2025-01-31", "expense", "cur-ils", "20.20", 2),
                g("2025-01-15", "income", "cur-ils", "5", 1),
                g("2025-01-15", "expense", "cur-usd", "1", 1),
                g("2025-02-01", "expense", "cur-ils", "100", 1),
            ]);

            const rows = await service.aggregate("u1", filters, "month");

            expect(rows).toHaveLength(4);
            expect(rows[0]).toMatchObject({ key: "2025-02", label: "2025-02", sum: 100, count: 1 });
            expect(rows).toContainEqual({
                key: "2025-01",
                label: "2025-01",
                type: "expense",
                transferDirection: null,
                currencyCode: "ILS",
                sum: 30.3,
                count: 3,
            });
            expect(rows.map((r) => r.sum)).toEqual([100, 30.3, 5, 1]);
        });

        it("labels categories and uncategorized, sorted by sum then label", async () => {
            const g = (categoryId: string | null, sum: string) => ({
                categoryId,
                type: "expense",
                transferDirection: null,
                currencyId: "cur-ils",
                _sum: { amount: new Prisma.Decimal(sum) },
                _count: { _all: 1 },
            });
            mockPrismaService.transaction.groupBy.mockResolvedValue([g("c2", "10"), g(null, "10"), g("c1", "50")]);
            mockPrismaService.category.findMany.mockResolvedValue([
                { id: "c1", name: "Food" },
                { id: "c2", name: "Bills" },
            ]);

            const rows = await service.aggregate("u1", filters, "category");

            expect(mockPrismaService.category.findMany).toHaveBeenCalledWith({
                where: { id: { in: ["c2", "c1"] }, OR: [{ isSystem: true }, { userId: "u1" }] },
                select: { id: true, name: true },
            });
            expect(rows.map((r) => [r.key, r.label])).toEqual([
                ["c1", "Food"],
                ["c2", "Bills"],
                [null, "Uncategorized"],
            ]);
        });

        it("scopes the account name lookup by userId", async () => {
            mockPrismaService.transaction.groupBy.mockResolvedValue([
                {
                    accountId: "a1",
                    type: "expense",
                    transferDirection: null,
                    currencyId: "cur-ils",
                    _sum: { amount: new Prisma.Decimal("4") },
                    _count: { _all: 1 },
                },
            ]);
            mockPrismaService.account.findMany.mockResolvedValue([{ id: "a1", name: "Main" }]);

            const rows = await service.aggregate("u1", filters, "account");

            expect(mockPrismaService.account.findMany).toHaveBeenCalledWith({
                where: { id: { in: ["a1"] }, userId: "u1" },
                select: { id: true, name: true },
            });
            expect(rows[0].label).toBe("Main");
        });

        it("uses the description as merchant key and label", async () => {
            mockPrismaService.transaction.groupBy.mockResolvedValue([
                {
                    description: "Shufersal",
                    type: "expense",
                    transferDirection: null,
                    currencyId: "cur-ils",
                    _sum: { amount: new Prisma.Decimal("9") },
                    _count: { _all: 2 },
                },
            ]);
            const rows = await service.aggregate("u1", filters, "merchant");
            expect(rows[0]).toMatchObject({ key: "Shufersal", label: "Shufersal", count: 2 });
        });

        describe("reimbursement netting", () => {
            // Two 150 links: a March expense of 600 reimbursed by an April income of 350 (300 allocated).
            const expenseLinks = [
                {
                    amount: new Prisma.Decimal("150"),
                    expense: {
                        type: "expense",
                        transactionDate: new Date("2025-03-10"),
                        categoryId: "c1",
                        description: "Dinner",
                        accountId: "a1",
                        currencyId: "cur-ils",
                        transferDirection: null,
                    },
                },
                {
                    amount: new Prisma.Decimal("150"),
                    expense: {
                        type: "expense",
                        transactionDate: new Date("2025-03-10"),
                        categoryId: "c1",
                        description: "Dinner",
                        accountId: "a1",
                        currencyId: "cur-ils",
                        transferDirection: null,
                    },
                },
            ];
            const incomeLinks = [
                {
                    amount: new Prisma.Decimal("150"),
                    income: {
                        type: "income",
                        transactionDate: new Date("2025-04-05"),
                        categoryId: "c2",
                        description: "Refund",
                        accountId: "a1",
                        currencyId: "cur-ils",
                        transferDirection: null,
                    },
                },
                {
                    amount: new Prisma.Decimal("150"),
                    income: {
                        type: "income",
                        transactionDate: new Date("2025-04-05"),
                        categoryId: "c2",
                        description: "Refund",
                        accountId: "a1",
                        currencyId: "cur-ils",
                        transferDirection: null,
                    },
                },
            ];
            const mockLinks = () =>
                mockPrismaService.reimbursementAllocation.findMany.mockImplementation(({ where }) =>
                    Promise.resolve("AND" in where.expense ? expenseLinks : incomeLinks),
                );

            it("month: the expense's gross leaves its own month and the income's leaves April", async () => {
                mockPrismaService.transaction.groupBy.mockResolvedValue([
                    {
                        transactionDate: new Date("2025-03-10"),
                        type: "expense",
                        transferDirection: null,
                        currencyId: "cur-ils",
                        _sum: { amount: new Prisma.Decimal("600") },
                        _count: { _all: 2 },
                    },
                    {
                        transactionDate: new Date("2025-04-05"),
                        type: "income",
                        transferDirection: null,
                        currencyId: "cur-ils",
                        _sum: { amount: new Prisma.Decimal("350") },
                        _count: { _all: 1 },
                    },
                ]);
                mockLinks();

                const rows = await service.aggregate("u1", filters, "month");

                expect(rows).toContainEqual({
                    key: "2025-03",
                    label: "2025-03",
                    type: "expense",
                    transferDirection: null,
                    currencyCode: "ILS",
                    sum: 300,
                    count: 2,
                });
                expect(rows).toContainEqual({
                    key: "2025-04",
                    label: "2025-04",
                    type: "income",
                    transferDirection: null,
                    currencyCode: "ILS",
                    sum: 50,
                    count: 1,
                });
            });

            it("category: each side is netted in its own category bucket", async () => {
                mockPrismaService.transaction.groupBy.mockResolvedValue([
                    {
                        categoryId: "c1",
                        type: "expense",
                        transferDirection: null,
                        currencyId: "cur-ils",
                        _sum: { amount: new Prisma.Decimal("600") },
                        _count: { _all: 2 },
                    },
                    {
                        categoryId: "c2",
                        type: "income",
                        transferDirection: null,
                        currencyId: "cur-ils",
                        _sum: { amount: new Prisma.Decimal("350") },
                        _count: { _all: 1 },
                    },
                ]);
                mockPrismaService.category.findMany.mockResolvedValue([
                    { id: "c1", name: "Food" },
                    { id: "c2", name: "Refunds" },
                ]);
                mockLinks();

                const rows = await service.aggregate("u1", filters, "category");

                expect(rows.map((r) => [r.label, r.type, r.sum, r.count])).toEqual([
                    ["Food", "expense", 300, 2],
                    ["Refunds", "income", 50, 1],
                ]);
            });

            it("scopes the allocation queries by the row filters and the type", async () => {
                mockPrismaService.transaction.groupBy.mockResolvedValue([]);
                mockLinks();

                await service.aggregate("u1", { ...filters, type: "income" }, "month");

                const calls = mockPrismaService.reimbursementAllocation.findMany.mock.calls.map(([args]) => args);
                const expenseSide = calls.find((args) => "AND" in args.where.expense);
                expect(expenseSide.where.expense.AND).toEqual([
                    expect.objectContaining({ userId: "u1", type: "income" }),
                    { type: "expense", hidden: false },
                ]);
                expect(expenseSide.where.income).toEqual({ deletedAt: null, hidden: false });
            });
        });
    });

    describe("update", () => {
        it("should update notes", async () => {
            mockPrismaService.transaction.findFirst.mockResolvedValue(mockTransaction);
            mockPrismaService.transaction.update.mockResolvedValue({ ...mockTransaction, notes: "New note" });
            mockPrismaService.budget.findMany.mockResolvedValue([]);

            await service.update("transaction-id", "test-user", { notes: "New note" });

            expect(mockPrismaService.transaction.update).toHaveBeenCalledWith({
                where: { id: "transaction-id" },
                data: { notes: "New note" },
            });
        });

        it("should update a transaction", async () => {
            const updateDto = {
                description: "Updated Description",
                amount: 50.0,
            };

            mockPrismaService.transaction.findFirst.mockResolvedValue({ ...mockTransaction, externalId: null });
            mockPrismaService.transaction.update.mockResolvedValue({
                ...mockTransaction,
                ...updateDto,
            });

            mockPrismaService.budget.findMany.mockResolvedValue([]);

            const result = await service.update("transaction-id", "test-user", updateDto);

            expect(result.description).toBe("Updated Description");
            expect(result.amount).toBe(50.0);
            expect(mockPrismaService.transaction.update).toHaveBeenCalledWith({
                where: { id: "transaction-id" },
                data: updateDto,
            });
        });

        it("should update with date conversion", async () => {
            const updateDto = {
                transactionDate: "2025-12-20",
                postedDate: "2025-12-22",
            };

            mockPrismaService.transaction.findFirst.mockResolvedValue({ ...mockTransaction, externalId: null });
            mockPrismaService.transaction.update.mockResolvedValue(mockTransaction);
            mockPrismaService.budget.findMany.mockResolvedValue([]);

            await service.update("transaction-id", "test-user", updateDto);

            expect(mockPrismaService.transaction.update).toHaveBeenCalledWith({
                where: { id: "transaction-id" },
                data: {
                    transactionDate: new Date("2025-12-20"),
                    postedDate: new Date("2025-12-22"),
                },
            });
        });

        it("should default transferDirection to out when an expense becomes a transfer", async () => {
            mockPrismaService.transaction.findFirst.mockResolvedValue({ id: "transaction-id", type: "expense" });
            mockPrismaService.transaction.update.mockResolvedValue({ ...mockTransaction, type: "transfer" });

            await service.update("transaction-id", "test-user", { type: "transfer" });

            expect(mockPrismaService.transaction.update).toHaveBeenCalledWith({
                where: { id: "transaction-id" },
                data: { type: "transfer", transferDirection: "out" },
            });
        });

        it("should default transferDirection to in when an income becomes a transfer", async () => {
            mockPrismaService.transaction.findFirst.mockResolvedValue({ id: "transaction-id", type: "income" });
            mockPrismaService.transaction.update.mockResolvedValue({ ...mockTransaction, type: "transfer" });

            await service.update("transaction-id", "test-user", { type: "transfer" });

            expect(mockPrismaService.transaction.update).toHaveBeenCalledWith({
                where: { id: "transaction-id" },
                data: { type: "transfer", transferDirection: "in" },
            });
        });

        it("should keep an explicitly provided transferDirection", async () => {
            mockPrismaService.transaction.findFirst.mockResolvedValue({ id: "transaction-id", type: "expense" });
            mockPrismaService.transaction.update.mockResolvedValue({ ...mockTransaction, type: "transfer" });

            await service.update("transaction-id", "test-user", { type: "transfer", transferDirection: "in" });

            expect(mockPrismaService.transaction.update).toHaveBeenCalledWith({
                where: { id: "transaction-id" },
                data: { type: "transfer", transferDirection: "in" },
            });
        });

        it("should clear transferDirection when a transfer reverts to income/expense", async () => {
            mockPrismaService.transaction.findFirst.mockResolvedValue({ id: "transaction-id", type: "transfer" });
            mockPrismaService.transaction.update.mockResolvedValue(mockTransaction);
            mockPrismaService.budget.findMany.mockResolvedValue([]);

            await service.update("transaction-id", "test-user", { type: "expense" });

            expect(mockPrismaService.transaction.update).toHaveBeenCalledWith({
                where: { id: "transaction-id" },
                data: { type: "expense", transferDirection: null },
            });
        });

        it("should not overwrite an existing direction when a transfer's type is re-affirmed", async () => {
            mockPrismaService.transaction.findFirst.mockResolvedValue({
                id: "transaction-id",
                type: "transfer",
                transferDirection: "in",
            });
            mockPrismaService.transaction.update.mockResolvedValue({ ...mockTransaction, type: "transfer" });

            await service.update("transaction-id", "test-user", { type: "transfer" });

            expect(mockPrismaService.transaction.update).toHaveBeenCalledWith({
                where: { id: "transaction-id" },
                data: { type: "transfer" },
            });
        });

        it("should strip a stray direction sent for a non-transfer transaction", async () => {
            mockPrismaService.transaction.findFirst.mockResolvedValue({
                id: "transaction-id",
                type: "expense",
                transferDirection: null,
            });
            mockPrismaService.transaction.update.mockResolvedValue(mockTransaction);
            mockPrismaService.budget.findMany.mockResolvedValue([]);

            await service.update("transaction-id", "test-user", { transferDirection: "in" } as never);

            expect(mockPrismaService.transaction.update).toHaveBeenCalledWith({
                where: { id: "transaction-id" },
                data: { transferDirection: null },
            });
        });
    });

    describe("update cash-account currency", () => {
        const manual = { ...mockTransaction, externalId: null, accountId: "acc-1", currencyId: "usd-id" };
        const ilsCash = { type: "cash", currencyId: "ils-id", currency: { code: "ILS" } };

        beforeEach(() => {
            mockPrismaService.transaction.update.mockResolvedValue(manual);
            mockPrismaService.budget.findMany.mockResolvedValue([]);
        });

        it("rejects moving a manual USD row onto an ILS cash account", async () => {
            mockPrismaService.transaction.findFirst.mockResolvedValue(manual);
            mockPrismaService.account.findFirst.mockResolvedValue(ilsCash);

            await expect(service.update("transaction-id", "test-user", { accountId: "cash-id" })).rejects.toThrow(
                "Transactions on a cash account must be in its currency (ILS)",
            );
            expect(mockPrismaService.transaction.update).not.toHaveBeenCalled();
        });

        it("rejects changing only currencyId on a cash-account row", async () => {
            mockPrismaService.transaction.findFirst.mockResolvedValue({ ...manual, currencyId: "ils-id" });
            mockPrismaService.account.findFirst.mockResolvedValue(ilsCash);

            await expect(service.update("transaction-id", "test-user", { currencyId: "usd-id" })).rejects.toThrow(
                "Transactions on a cash account must be in its currency (ILS)",
            );
            expect(mockPrismaService.account.findFirst).toHaveBeenCalledWith(
                expect.objectContaining({ where: expect.objectContaining({ id: "acc-1" }) }),
            );
            expect(mockPrismaService.transaction.update).not.toHaveBeenCalled();
        });

        it("skips the account lookup for a synced row", async () => {
            mockPrismaService.transaction.findFirst.mockResolvedValue({ ...manual, externalId: "TXN-001" });

            await service.update("transaction-id", "test-user", { notes: "x" });

            expect(mockPrismaService.account.findFirst).not.toHaveBeenCalled();
            expect(mockPrismaService.transaction.update).toHaveBeenCalled();
        });

        it("skips the account lookup when neither accountId nor currencyId is sent", async () => {
            mockPrismaService.transaction.findFirst.mockResolvedValue(manual);

            await service.update("transaction-id", "test-user", { notes: "x" });

            expect(mockPrismaService.account.findFirst).not.toHaveBeenCalled();
            expect(mockPrismaService.transaction.update).toHaveBeenCalled();
        });
    });

    describe("update synced-row lock", () => {
        const synced = { ...mockTransaction, externalId: "TXN-001" };
        const manual = { ...mockTransaction, externalId: null };

        beforeEach(() => {
            mockPrismaService.transaction.update.mockResolvedValue(mockTransaction);
            mockPrismaService.budget.findMany.mockResolvedValue([]);
        });

        it("rejects a bank-owned field change on a synced row", async () => {
            mockPrismaService.transaction.findFirst.mockResolvedValue(synced);

            await expect(service.update("transaction-id", "test-user", { amount: 99 })).rejects.toThrow(
                BadRequestException,
            );
            expect(mockPrismaService.transaction.update).not.toHaveBeenCalled();
        });

        it("rejects clearing externalId on a synced row", async () => {
            mockPrismaService.transaction.findFirst.mockResolvedValue(synced);

            await expect(
                service.update("transaction-id", "test-user", { externalId: null } as unknown as UpdateTransactionDto),
            ).rejects.toThrow(BadRequestException);
            expect(mockPrismaService.transaction.update).not.toHaveBeenCalled();
        });

        it.each([
            ["notes", { notes: "x" }],
            ["markAsTransfer", { type: "transfer", transferDirection: "out" }],
            ["revertTransfer", { type: "expense" }],
            ["hidden", { hidden: true }],
            ["categoryId", { categoryId: "category-2" }],
        ])("allows %s on a synced row", async (_name, dto) => {
            mockPrismaService.transaction.findFirst.mockResolvedValue(synced);

            await service.update("transaction-id", "test-user", dto as UpdateTransactionDto);

            expect(mockPrismaService.transaction.update).toHaveBeenCalled();
        });

        it("lets a synced expense become a transfer and creates its mirror (counterpart)", async () => {
            mockPrismaService.transaction.findFirst.mockResolvedValue({ ...synced, counterpart: null });
            mockPrismaService.transaction.update.mockResolvedValue({
                ...mockTransaction,
                type: "transfer",
                transferDirection: "out",
            });
            mockPrismaService.account.findFirst.mockResolvedValue({
                id: "cash-account-id",
                type: "cash",
                currencyId: "currency-id",
            });

            await service.update("transaction-id", "test-user", {
                type: "transfer",
                transferDirection: "out",
                counterpartAccountId: "cash-account-id",
            } as UpdateTransactionDto);

            expect(mockPrismaService.transaction.create.mock.calls[0][0].data).toMatchObject({
                accountId: "cash-account-id",
                counterpartOfId: "transaction-id",
                transferDirection: "in",
            });
            const data = mockPrismaService.transaction.update.mock.calls[0][0].data;
            expect(data).not.toHaveProperty("counterpartAccountId");
        });

        it("never writes locked fields on a synced row (sub-cent amount cannot alter the stored amount)", async () => {
            mockPrismaService.transaction.findFirst.mockResolvedValue({ ...synced, amount: 1 });

            await service.update("transaction-id", "test-user", { amount: 1.005, notes: "x" });

            const data = mockPrismaService.transaction.update.mock.calls[0][0].data;
            expect(data).not.toHaveProperty("amount");
            expect(data.notes).toBe("x");
        });

        it("allows changing amount, description and dates on a manual row", async () => {
            mockPrismaService.transaction.findFirst.mockResolvedValue(manual);
            const dto = {
                amount: 10,
                description: "Edited",
                transactionDate: "2025-12-20",
                postedDate: "2025-12-22",
            };

            await service.update("transaction-id", "test-user", dto);

            expect(mockPrismaService.transaction.update).toHaveBeenCalled();
        });
    });

    describe("update reimbursement guard", () => {
        const manual = { ...mockTransaction, externalId: null };

        /** Allocation rows the guard reads inside the transaction, by the side this row sits on. */
        const mockAllocations = ({ asExpense = [], asIncome = [] }: { asExpense?: number[]; asIncome?: number[] }) => {
            mockPrismaService.reimbursementAllocation.findMany.mockImplementation(({ where }) =>
                Promise.resolve((where.expenseId !== undefined ? asExpense : asIncome).map((amount) => ({ amount }))),
            );
        };

        beforeEach(() => {
            mockPrismaService.transaction.update.mockResolvedValue(mockTransaction);
            mockPrismaService.budget.findMany.mockResolvedValue([]);
        });

        it("rejects lowering the amount of a linked expense below its allocated total", async () => {
            mockPrismaService.transaction.findFirst.mockResolvedValue(manual);
            mockAllocations({ asExpense: [40] });

            await expect(service.update("transaction-id", "test-user", { amount: 39 })).rejects.toThrow(
                BadRequestException,
            );
            expect(mockPrismaService.transaction.update).not.toHaveBeenCalled();
        });

        it("allows setting a linked expense's amount to exactly its allocated total", async () => {
            mockPrismaService.transaction.findFirst.mockResolvedValue(manual);
            mockAllocations({ asExpense: [40] });

            await service.update("transaction-id", "test-user", { amount: 40 });

            expect(mockPrismaService.transaction.update).toHaveBeenCalled();
        });

        it("rejects turning a linked income into a transfer", async () => {
            mockPrismaService.transaction.findFirst.mockResolvedValue({ ...manual, type: "income" });
            mockAllocations({ asIncome: [30] });

            await expect(
                service.update("transaction-id", "test-user", {
                    type: "transfer",
                    transferDirection: "in",
                } as UpdateTransactionDto),
            ).rejects.toThrow(BadRequestException);
            expect(mockPrismaService.transaction.update).not.toHaveBeenCalled();
        });

        it("allows a hidden toggle on a linked row", async () => {
            mockPrismaService.transaction.findFirst.mockResolvedValue(manual);
            mockAllocations({ asExpense: [40] });

            await service.update("transaction-id", "test-user", { hidden: true });

            expect(mockPrismaService.transaction.update).toHaveBeenCalledWith({
                where: { id: "transaction-id" },
                data: { hidden: true },
            });
        });

        it("does not guard an unlinked row", async () => {
            mockPrismaService.transaction.findFirst.mockResolvedValue(manual);
            mockAllocations({});

            await service.update("transaction-id", "test-user", { amount: 1, currencyId: "currency-id" });

            expect(mockPrismaService.transaction.update).toHaveBeenCalled();
        });

        it("reads the allocation sums inside the transaction, so a link added after the row was loaded still blocks the edit", async () => {
            // The row was loaded before the link committed; only the in-transaction read sees the 40.
            mockPrismaService.transaction.findFirst.mockResolvedValue(manual);
            mockAllocations({ asExpense: [40] });

            await expect(service.update("transaction-id", "test-user", { amount: 39 })).rejects.toThrow(
                BadRequestException,
            );
            expect(mockPrismaService.$transaction).toHaveBeenCalledWith(expect.any(Function));
            expect(mockPrismaService.transaction.update).not.toHaveBeenCalled();
        });

        it("takes the reimbursement lock before reading the allocation sums", async () => {
            mockPrismaService.transaction.findFirst.mockResolvedValue(manual);
            mockAllocations({ asExpense: [40] });

            await service.update("transaction-id", "test-user", { amount: 40 });

            expect(mockPrismaService.$executeRaw).toHaveBeenCalledTimes(1);
            // The lock key is interpolated as a parameter, so the value sits in the template's args.
            const [strings, ...values] = mockPrismaService.$executeRaw.mock.calls[0];
            expect(strings.join("?")).toContain("pg_advisory_xact_lock(hashtext(");
            expect(values).toEqual(["reimbursement:test-user"]);
            const lockOrder = mockPrismaService.$executeRaw.mock.invocationCallOrder[0];
            expect(mockPrismaService.reimbursementAllocation.findMany.mock.invocationCallOrder[0]).toBeGreaterThan(
                lockOrder,
            );
        });
    });

    describe("markAsCardPayoff", () => {
        it("should create a pattern and retag matching transactions via the patterns service", async () => {
            const pattern = { id: "pattern-id", description: "כ.א.ל חיוב" };

            mockPrismaService.transaction.findFirst.mockResolvedValue({ id: "transaction-id", type: "expense" });
            mockCardPayoffPatternsService.create.mockResolvedValue(pattern);
            mockCardPayoffPatternsService.applyPatternDescription.mockResolvedValue({ count: 4, linksRemoved: 2 });

            const result = await service.markAsCardPayoff("transaction-id", "test-user", "כ.א.ל חיוב");

            expect(result).toEqual({ count: 4, linksRemoved: 2, pattern });
            expect(mockCardPayoffPatternsService.create).toHaveBeenCalledWith("test-user", {
                description: "כ.א.ל חיוב",
            });
            expect(mockCardPayoffPatternsService.applyPatternDescription).toHaveBeenCalledWith(
                "test-user",
                "כ.א.ל חיוב",
            );
        });

        it("should throw NotFoundException for a transaction the user does not own", async () => {
            mockPrismaService.transaction.findFirst.mockResolvedValue(null);

            await expect(service.markAsCardPayoff("other-id", "test-user", "desc")).rejects.toThrow(NotFoundException);
            expect(mockCardPayoffPatternsService.create).not.toHaveBeenCalled();
        });
    });

    describe("linked transfer mirror guards", () => {
        const mirrorRow = { ...mockTransaction, counterpartOfId: "src-id", counterpart: null };
        const source = { description: "ATM withdrawal", account: { name: "Main card" } };

        it("rejects editing mirror fields and names the source", async () => {
            mockPrismaService.transaction.findFirst.mockResolvedValueOnce(mirrorRow).mockResolvedValueOnce(source);

            const err = await service.update("transaction-id", "test-user", { amount: 5 }).catch((e) => e);

            expect(err).toBeInstanceOf(BadRequestException);
            expect(err.message).toBe(
                "This entry is linked to “ATM withdrawal” on Main card. Edit that transaction instead.",
            );
            expect(mockPrismaService.transaction.update).not.toHaveBeenCalled();
        });

        it("allows a notes-only PATCH on a mirror", async () => {
            mockPrismaService.transaction.findFirst.mockResolvedValueOnce(mirrorRow).mockResolvedValueOnce(source);
            mockPrismaService.transaction.update.mockResolvedValue({ ...mirrorRow, notes: "n" });
            mockPrismaService.budget.findMany.mockResolvedValue([]);

            await service.update("transaction-id", "test-user", { notes: "n" });

            expect(mockPrismaService.transaction.update).toHaveBeenCalledWith({
                where: { id: "transaction-id" },
                data: { notes: "n" },
            });
        });

        it("rejects deleting a mirror", async () => {
            mockPrismaService.transaction.findFirst.mockResolvedValueOnce(mirrorRow).mockResolvedValueOnce(source);

            await expect(service.remove("transaction-id", "test-user")).rejects.toThrow(
                "This entry is linked to “ATM withdrawal” on Main card. Delete that transaction instead.",
            );
            expect(mockPrismaService.transaction.update).not.toHaveBeenCalled();
            expect(mockPrismaService.transaction.deleteMany).not.toHaveBeenCalled();
        });

        it("hard-deletes the mirror when the source is removed", async () => {
            mockPrismaService.transaction.findFirst.mockResolvedValue({ ...mockTransaction, counterpartOfId: null });
            mockPrismaService.transaction.update.mockResolvedValue({ ...mockTransaction, deletedAt: new Date() });
            mockPrismaService.transaction.deleteMany.mockResolvedValue({ count: 1 });

            await service.remove("transaction-id", "test-user");

            expect(mockPrismaService.transaction.deleteMany).toHaveBeenCalledWith({
                where: { counterpartOfId: "transaction-id" },
            });
        });
    });

    describe("remove", () => {
        it("should soft delete a transaction", async () => {
            mockPrismaService.transaction.findFirst.mockResolvedValue(mockTransaction);
            mockPrismaService.transaction.update.mockResolvedValue({
                ...mockTransaction,
                deletedAt: new Date(),
            });

            const result = await service.remove("transaction-id", "test-user");

            expect(result.deletedAt).toBeTruthy();
            expect(mockPrismaService.transaction.update).toHaveBeenCalledWith({
                where: { id: "transaction-id" },
                data: { deletedAt: expect.any(Date) },
            });
        });

        it("removes the row's reimbursement allocations on either side in the same write", async () => {
            mockPrismaService.transaction.findFirst.mockResolvedValue(mockTransaction);
            mockPrismaService.transaction.update.mockResolvedValue({ ...mockTransaction, deletedAt: new Date() });

            await service.remove("transaction-id", "test-user");

            expect(mockPrismaService.reimbursementAllocation.deleteMany).toHaveBeenCalledWith({
                where: { OR: [{ incomeId: "transaction-id" }, { expenseId: "transaction-id" }] },
            });
        });

        it("takes the reimbursement lock before soft-deleting and clearing allocations", async () => {
            mockPrismaService.transaction.findFirst.mockResolvedValue(mockTransaction);
            mockPrismaService.transaction.update.mockResolvedValue({ ...mockTransaction, deletedAt: new Date() });

            await service.remove("transaction-id", "test-user");

            expect(mockPrismaService.$executeRaw).toHaveBeenCalledTimes(1);
            const [strings, ...values] = mockPrismaService.$executeRaw.mock.calls[0];
            expect(strings.join("?")).toContain("pg_advisory_xact_lock(hashtext(");
            expect(values).toEqual(["reimbursement:test-user"]);
            const lockOrder = mockPrismaService.$executeRaw.mock.invocationCallOrder[0];
            expect(mockPrismaService.transaction.update.mock.invocationCallOrder[0]).toBeGreaterThan(lockOrder);
            expect(mockPrismaService.reimbursementAllocation.deleteMany.mock.invocationCallOrder[0]).toBeGreaterThan(
                lockOrder,
            );
        });
    });

    describe("addAttachment", () => {
        const createAttachmentDto = {
            fileName: "receipt.jpg",
            mimeType: "image/jpeg",
            sizeBytes: 1258291,
        };

        it("should create attachment metadata scoped to the owned transaction", async () => {
            const createdAttachment = {
                id: "attachment-id",
                transactionId: "transaction-id",
                userId: "test-user",
                ...createAttachmentDto,
                storageKey: null,
                createdAt: new Date(),
                updatedAt: new Date(),
                deletedAt: null,
            };
            mockPrismaService.transaction.findFirst.mockResolvedValue({ id: "transaction-id", type: "expense" });
            mockPrismaService.transactionAttachment.create.mockResolvedValue(createdAttachment);

            const result = await service.addAttachment("transaction-id", "test-user", createAttachmentDto);

            expect(result).toEqual(createdAttachment);
            expect(mockPrismaService.transaction.findFirst).toHaveBeenCalledWith({
                where: { id: "transaction-id", userId: "test-user", deletedAt: null },
                select: { id: true, type: true, transferDirection: true, counterpartOfId: true },
            });
            expect(mockPrismaService.transactionAttachment.create).toHaveBeenCalledWith({
                data: {
                    ...createAttachmentDto,
                    transactionId: "transaction-id",
                    userId: "test-user",
                },
            });
        });

        it("should throw NotFoundException when the transaction belongs to another user", async () => {
            mockPrismaService.transaction.findFirst.mockResolvedValue(null);

            await expect(service.addAttachment("transaction-id", "other-user", createAttachmentDto)).rejects.toThrow(
                NotFoundException,
            );
            expect(mockPrismaService.transactionAttachment.create).not.toHaveBeenCalled();
        });
    });

    describe("removeAttachment", () => {
        it("should soft delete an attachment scoped to transaction and user", async () => {
            mockPrismaService.transactionAttachment.findFirst.mockResolvedValue({ id: "attachment-id" });
            mockPrismaService.transactionAttachment.update.mockResolvedValue({});

            await service.removeAttachment("transaction-id", "attachment-id", "test-user");

            expect(mockPrismaService.transactionAttachment.findFirst).toHaveBeenCalledWith({
                where: {
                    id: "attachment-id",
                    transactionId: "transaction-id",
                    userId: "test-user",
                    deletedAt: null,
                },
                select: { id: true },
            });
            expect(mockPrismaService.transactionAttachment.update).toHaveBeenCalledWith({
                where: { id: "attachment-id" },
                data: { deletedAt: expect.any(Date) },
            });
        });

        it("should throw NotFoundException when the attachment does not belong to the user", async () => {
            mockPrismaService.transactionAttachment.findFirst.mockResolvedValue(null);

            await expect(service.removeAttachment("transaction-id", "attachment-id", "other-user")).rejects.toThrow(
                NotFoundException,
            );
            expect(mockPrismaService.transactionAttachment.update).not.toHaveBeenCalled();
        });
    });
});
