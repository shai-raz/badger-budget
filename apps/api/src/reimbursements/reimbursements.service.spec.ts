import { Test, TestingModule } from "@nestjs/testing";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { ReimbursementsService } from "./reimbursements.service";
import { PrismaService } from "../prisma/prisma.service";

const USER = "user-1";
const OTHER_USER = "user-2";
const CURRENCY = "cur-ils";
const CREATED_AT = new Date("2026-10-01T00:00:00Z");

type Row = {
    id: string;
    userId: string;
    type: string;
    currencyId: string;
    amount: number;
    hidden: boolean;
    deletedAt: Date | null;
};

type Allocation = { id: string; userId: string; incomeId: string; expenseId: string; amount: number };

/** The subset of Prisma `where` inputs the service sends, as the mocks read them. */
type TransactionWhere = { id: string; userId: string; deletedAt?: null };
type AllocationWhere = { id?: string | { not: string }; userId?: string; incomeId?: string; expenseId?: string };

describe("ReimbursementsService", () => {
    let service: ReimbursementsService;

    let transactions: Row[];
    let allocations: Allocation[];

    const sumWhere = (where: AllocationWhere) => {
        const excludedId = typeof where.id === "object" ? where.id.not : undefined;
        return allocations
            .filter(
                (a) =>
                    (where.expenseId === undefined || a.expenseId === where.expenseId) &&
                    (where.incomeId === undefined || a.incomeId === where.incomeId) &&
                    (excludedId === undefined || a.id !== excludedId),
            )
            .reduce((acc, a) => acc + a.amount, 0);
    };

    const mockPrismaService = {
        $transaction: jest.fn((cb: (tx: unknown) => unknown) => cb(mockPrismaService)),
        $executeRaw: jest.fn(),
        transaction: {
            findFirst: jest.fn(({ where }: { where: TransactionWhere }) => {
                const row = transactions.find(
                    (t) =>
                        t.id === where.id &&
                        t.userId === where.userId &&
                        (where.deletedAt === null ? t.deletedAt === null : true),
                );
                return row ? { ...row } : null;
            }),
        },
        reimbursementAllocation: {
            findFirst: jest.fn(({ where }: { where: { id: string; userId: string } }) => {
                const row = allocations.find((a) => a.id === where.id && a.userId === where.userId);
                if (!row) return null;
                const income = transactions.find((t) => t.id === row.incomeId)!;
                const expense = transactions.find((t) => t.id === row.expenseId)!;
                return { ...row, income: { amount: income.amount }, expense: { amount: expense.amount } };
            }),
            findUnique: jest.fn(
                ({ where }: { where: { incomeId_expenseId: { incomeId: string; expenseId: string } } }) => {
                    const { incomeId, expenseId } = where.incomeId_expenseId;
                    return allocations.find((a) => a.incomeId === incomeId && a.expenseId === expenseId) ?? null;
                },
            ),
            aggregate: jest.fn(({ where }: { where: AllocationWhere }) => ({
                _sum: { amount: sumWhere(where) || null },
            })),
            create: jest.fn(({ data }: { data: Omit<Allocation, "id"> }) => {
                const row = { id: "alloc-new", ...data };
                return { ...row, createdAt: CREATED_AT, updatedAt: CREATED_AT };
            }),
            update: jest.fn(({ where, data }: { where: { id: string }; data: { amount: number } }) => {
                const row = allocations.find((a) => a.id === where.id)!;
                row.amount = data.amount;
                return { ...row, createdAt: CREATED_AT, updatedAt: CREATED_AT };
            }),
            deleteMany: jest.fn(({ where }: { where: { id: string; userId: string } }) => {
                const before = allocations.length;
                allocations = allocations.filter((a) => !(a.id === where.id && a.userId === where.userId));
                return { count: before - allocations.length };
            }),
        },
    };

    const income = (overrides: Partial<Row> = {}): Row => ({
        id: "income-1",
        userId: USER,
        type: "income",
        currencyId: CURRENCY,
        amount: 500,
        hidden: false,
        deletedAt: null,
        ...overrides,
    });

    const expense = (overrides: Partial<Row> = {}): Row => ({
        id: "expense-1",
        userId: USER,
        type: "expense",
        currencyId: CURRENCY,
        amount: 600,
        hidden: false,
        deletedAt: null,
        ...overrides,
    });

    beforeEach(async () => {
        transactions = [income(), expense(), income({ id: "income-2" }), expense({ id: "expense-2" })];
        allocations = [];

        const module: TestingModule = await Test.createTestingModule({
            providers: [ReimbursementsService, { provide: PrismaService, useValue: mockPrismaService }],
        }).compile();

        service = module.get<ReimbursementsService>(ReimbursementsService);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe("create", () => {
        it("creates an allocation and returns the amount as a number", async () => {
            const result = await service.create(USER, { incomeId: "income-1", expenseId: "expense-1", amount: 150 });

            expect(result).toEqual({
                id: "alloc-new",
                incomeId: "income-1",
                expenseId: "expense-1",
                amount: 150,
                createdAt: CREATED_AT,
                updatedAt: CREATED_AT,
            });
            expect(mockPrismaService.reimbursementAllocation.create).toHaveBeenCalledWith({
                data: { userId: USER, incomeId: "income-1", expenseId: "expense-1", amount: 150 },
            });
        });

        it("takes the per-user advisory lock inside the transaction", async () => {
            await service.create(USER, { incomeId: "income-1", expenseId: "expense-1", amount: 150 });

            expect(mockPrismaService.$transaction).toHaveBeenCalledTimes(1);
            expect(mockPrismaService.$executeRaw).toHaveBeenCalledTimes(1);
            // The lock key is interpolated as a parameter, so the value sits in the template's args.
            const [strings, ...values] = mockPrismaService.$executeRaw.mock.calls[0];
            expect(strings.join("?")).toContain("pg_advisory_xact_lock(hashtext(");
            expect(values).toEqual([`reimbursement:${USER}`]);
        });

        it("returns 404 when the income is not owned by the user", async () => {
            transactions = [income({ userId: OTHER_USER }), expense()];

            await expect(
                service.create(USER, { incomeId: "income-1", expenseId: "expense-1", amount: 150 }),
            ).rejects.toThrow(NotFoundException);
            expect(mockPrismaService.reimbursementAllocation.create).not.toHaveBeenCalled();
        });

        it("returns 404 when the expense is not owned by the user", async () => {
            transactions = [income(), expense({ userId: OTHER_USER })];

            await expect(
                service.create(USER, { incomeId: "income-1", expenseId: "expense-1", amount: 150 }),
            ).rejects.toThrow(NotFoundException);
        });

        it("returns 404 when the expense is soft-deleted", async () => {
            transactions = [income(), expense({ deletedAt: new Date() })];

            await expect(
                service.create(USER, { incomeId: "income-1", expenseId: "expense-1", amount: 150 }),
            ).rejects.toThrow(NotFoundException);
        });

        it("rejects a transfer on the income side", async () => {
            transactions = [income({ type: "transfer" }), expense()];

            await expect(
                service.create(USER, { incomeId: "income-1", expenseId: "expense-1", amount: 150 }),
            ).rejects.toThrow("Transfers can't be linked as reimbursements.");
        });

        it("rejects a transfer on the expense side", async () => {
            transactions = [income(), expense({ type: "transfer" })];

            await expect(
                service.create(USER, { incomeId: "income-1", expenseId: "expense-1", amount: 150 }),
            ).rejects.toBeInstanceOf(BadRequestException);
            await expect(
                service.create(USER, { incomeId: "income-1", expenseId: "expense-1", amount: 150 }),
            ).rejects.toThrow("Transfers can't be linked as reimbursements.");
        });

        it("rejects an expense passed as the income (wrong direction)", async () => {
            transactions = [expense({ id: "income-1" }), expense({ id: "expense-1" })];

            await expect(
                service.create(USER, { incomeId: "income-1", expenseId: "expense-1", amount: 150 }),
            ).rejects.toThrow("Only an income can reimburse an expense.");
        });

        it("rejects an income passed as the expense (wrong direction)", async () => {
            transactions = [income({ id: "income-1" }), income({ id: "expense-1" })];

            await expect(
                service.create(USER, { incomeId: "income-1", expenseId: "expense-1", amount: 150 }),
            ).rejects.toThrow("Only an income can reimburse an expense.");
        });

        it("rejects a currency mismatch", async () => {
            transactions = [income({ currencyId: "cur-usd" }), expense()];

            await expect(
                service.create(USER, { incomeId: "income-1", expenseId: "expense-1", amount: 150 }),
            ).rejects.toThrow("A reimbursement must be in the same currency as the expense.");
        });

        it("rejects a hidden income", async () => {
            transactions = [income({ hidden: true }), expense()];

            await expect(
                service.create(USER, { incomeId: "income-1", expenseId: "expense-1", amount: 150 }),
            ).rejects.toThrow("Unhide this transaction to link reimbursements.");
        });

        it("rejects a hidden expense", async () => {
            transactions = [income(), expense({ hidden: true })];

            await expect(
                service.create(USER, { incomeId: "income-1", expenseId: "expense-1", amount: 150 }),
            ).rejects.toThrow("Unhide this transaction to link reimbursements.");
        });

        it("rejects when the amount pushes the expense over its amount, counting existing links", async () => {
            // Expense is 600; 500 already allocated from another income. 150 more would be 650.
            allocations = [{ id: "alloc-a", userId: USER, incomeId: "income-2", expenseId: "expense-1", amount: 500 }];

            await expect(
                service.create(USER, { incomeId: "income-1", expenseId: "expense-1", amount: 150 }),
            ).rejects.toThrow("This would reimburse more than the expense amount (100.00 left).");
            expect(mockPrismaService.reimbursementAllocation.create).not.toHaveBeenCalled();
        });

        it("rejects when the amount pushes the income over its amount, counting existing links", async () => {
            // Income is 200 with 150 already allocated to another expense. 100 more would be 250.
            transactions = [income({ amount: 200 }), expense(), expense({ id: "expense-2" })];
            allocations = [{ id: "alloc-b", userId: USER, incomeId: "income-1", expenseId: "expense-2", amount: 150 }];

            await expect(
                service.create(USER, { incomeId: "income-1", expenseId: "expense-1", amount: 100 }),
            ).rejects.toThrow("This would allocate more than the income amount (50.00 left).");
        });

        it("allows an amount that lands exactly on the expense cap", async () => {
            allocations = [{ id: "alloc-a", userId: USER, incomeId: "income-2", expenseId: "expense-1", amount: 450 }];

            const result = await service.create(USER, { incomeId: "income-1", expenseId: "expense-1", amount: 150 });

            expect(result.amount).toBe(150);
            expect(mockPrismaService.reimbursementAllocation.create).toHaveBeenCalledTimes(1);
        });

        it("compares caps in cents so decimal sums do not drift", async () => {
            transactions = [income({ amount: 0.3 }), expense({ amount: 0.3 })];
            allocations = [{ id: "alloc-a", userId: USER, incomeId: "income-2", expenseId: "expense-1", amount: 0.1 }];

            await expect(
                service.create(USER, { incomeId: "income-1", expenseId: "expense-1", amount: 0.2 }),
            ).resolves.toMatchObject({ amount: 0.2 });
        });

        it("rejects a duplicate pair and points to the existing amount", async () => {
            allocations = [{ id: "alloc-a", userId: USER, incomeId: "income-1", expenseId: "expense-1", amount: 100 }];

            await expect(
                service.create(USER, { incomeId: "income-1", expenseId: "expense-1", amount: 50 }),
            ).rejects.toThrow("These transactions are already linked. Edit the existing amount instead.");
        });
    });

    describe("update", () => {
        beforeEach(() => {
            // Expense 600 covered by two incomes of 300 each.
            allocations = [
                { id: "alloc-own", userId: USER, incomeId: "income-1", expenseId: "expense-1", amount: 300 },
                { id: "alloc-other", userId: USER, incomeId: "income-2", expenseId: "expense-1", amount: 300 },
            ];
        });

        it("excludes the row's own old amount from the cap", async () => {
            const result = await service.update(USER, "alloc-own", { amount: 300 });

            expect(result.amount).toBe(300);
            expect(allocations.find((a) => a.id === "alloc-own")!.amount).toBe(300);
        });

        it("rejects an amount that pushes the expense over its amount", async () => {
            // The other 300 stays; 300 is left on the 600 expense for this row, so 301 does not fit.
            await expect(service.update(USER, "alloc-own", { amount: 301 })).rejects.toThrow(
                "This would reimburse more than the expense amount (300.00 left).",
            );
            expect(allocations.find((a) => a.id === "alloc-own")!.amount).toBe(300);
        });

        it("returns 404 when the allocation is not owned by the user", async () => {
            allocations[0].userId = OTHER_USER;

            await expect(service.update(USER, "alloc-own", { amount: 100 })).rejects.toThrow(NotFoundException);
        });

        it("takes the advisory lock", async () => {
            await service.update(USER, "alloc-own", { amount: 100 });

            expect(mockPrismaService.$executeRaw).toHaveBeenCalledTimes(1);
        });
    });

    describe("remove", () => {
        it("deletes the owned allocation", async () => {
            allocations = [{ id: "alloc-a", userId: USER, incomeId: "income-1", expenseId: "expense-1", amount: 100 }];

            await expect(service.remove(USER, "alloc-a")).resolves.toBeUndefined();

            expect(mockPrismaService.reimbursementAllocation.deleteMany).toHaveBeenCalledWith({
                where: { id: "alloc-a", userId: USER },
            });
            expect(allocations).toEqual([]);
        });

        it("returns 404 when nothing matches", async () => {
            await expect(service.remove(USER, "missing")).rejects.toThrow(NotFoundException);
        });
    });
});
