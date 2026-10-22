import { Test, TestingModule } from "@nestjs/testing";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { ReimbursementsService } from "./reimbursements.service";
import { PrismaService } from "../prisma/prisma.service";
import { AmountRuleSource, REIMBURSEMENT_SUGGESTION_SOURCES } from "./suggestion-sources";

const USER = "user-1";
const OTHER_USER = "user-2";
const CURRENCY = "cur-ils";
const CREATED_AT = new Date("2026-10-01T00:00:00Z");
const TXN_DATE = new Date("2026-10-10T00:00:00Z");

type Row = {
    id: string;
    userId: string;
    type: string;
    currencyId: string;
    amount: number;
    hidden: boolean;
    deletedAt: Date | null;
    transactionDate: Date;
    description: string;
    additionalDescription: string | null;
    category: { id: string; name: string; color: string; icon: string | null } | null;
};

type Allocation = { id: string; userId: string; incomeId: string; expenseId: string; amount: number };

/** The subset of Prisma `where` inputs the service sends, as the mocks read them. */
type TransactionWhere = { id: string; userId: string; deletedAt?: null };
type AllocationWhere = { id?: string | { not: string }; userId?: string; incomeId?: string; expenseId?: string };

describe("ReimbursementsService", () => {
    let service: ReimbursementsService;

    let transactions: Row[];
    let allocations: Allocation[];

    /**
     * Evaluates the subset of Prisma `where` the candidates query sends, against the in-memory rows. Unknown keys
     * compare by equality, which covers userId, type, currencyId, hidden and deletedAt.
     */
    const matchesWhere = (t: Row, where: Record<string, unknown>): boolean =>
        Object.entries(where).every(([key, cond]) => {
            switch (key) {
                case "AND":
                    return (cond as Record<string, unknown>[]).every((w) => matchesWhere(t, w));
                case "OR":
                    return (cond as Record<string, unknown>[]).some((w) => matchesWhere(t, w));
                case "NOT":
                    return !matchesWhere(t, cond as Record<string, unknown>);
                case "id":
                    return typeof cond === "object" ? t.id !== (cond as { not: string }).not : t.id === cond;
                case "reimbursedBy": {
                    const { incomeId } = (cond as { none: { incomeId: string } }).none;
                    return !allocations.some((a) => a.expenseId === t.id && a.incomeId === incomeId);
                }
                case "reimburses": {
                    const { expenseId } = (cond as { none: { expenseId: string } }).none;
                    return !allocations.some((a) => a.incomeId === t.id && a.expenseId === expenseId);
                }
                case "description":
                case "additionalDescription":
                    return String(t[key] ?? "")
                        .toLowerCase()
                        .includes(String((cond as { contains: string }).contains).toLowerCase());
                case "category": {
                    const { contains } = (cond as { name: { contains: string } }).name;
                    return (t.category?.name ?? "").toLowerCase().includes(contains.toLowerCase());
                }
                case "amount":
                case "transactionDate":
                    return rangeMatches(key === "amount" ? t.amount : t.transactionDate.getTime(), cond);
                default:
                    return t[key as keyof Row] === cond;
            }
        });

    const rangeMatches = (value: number, cond: unknown): boolean => {
        const num = (x: unknown) => (x instanceof Date ? x.getTime() : Number(x));
        if (typeof cond !== "object" || cond === null) return value === num(cond);
        const c = cond as Record<string, unknown>;
        return (
            (c.gte === undefined || value >= num(c.gte)) &&
            (c.lte === undefined || value <= num(c.lte)) &&
            (c.gt === undefined || value > num(c.gt)) &&
            (c.lt === undefined || value < num(c.lt))
        );
    };

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
                return row ? { ...row, currency: { code: "ILS" } } : null;
            }),
            findMany: jest.fn(
                ({
                    where,
                    orderBy,
                    take,
                }: {
                    where: Record<string, unknown>;
                    orderBy: Array<Record<string, "asc" | "desc">>;
                    take: number;
                }) => {
                    const [byDate, byId] = orderBy;
                    const dateSign = byDate.transactionDate === "asc" ? 1 : -1;
                    const idSign = (byId?.id ?? "asc") === "asc" ? 1 : -1;
                    return transactions
                        .filter((t) => matchesWhere(t, where))
                        .sort(
                            (a, b) =>
                                dateSign * (a.transactionDate.getTime() - b.transactionDate.getTime()) ||
                                idSign * a.id.localeCompare(b.id),
                        )
                        .slice(0, take)
                        .map((t) => ({
                            id: t.id,
                            type: t.type,
                            description: t.description,
                            additionalDescription: t.additionalDescription,
                            amount: t.amount,
                            transactionDate: t.transactionDate,
                            currency: { code: "ILS" },
                            category: t.category,
                        }));
                },
            ),
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
            groupBy: jest.fn(
                ({ by, where }: { by: Array<"incomeId" | "expenseId">; where: Record<string, { in: string[] }> }) => {
                    const key = by[0];
                    const sums = new Map<string, number>();
                    for (const a of allocations) {
                        if (where[key].in.includes(a[key])) sums.set(a[key], (sums.get(a[key]) ?? 0) + a.amount);
                    }
                    return [...sums].map(([id, amount]) => ({ [key]: id, _sum: { amount } }));
                },
            ),
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
        transactionDate: TXN_DATE,
        description: "Income",
        additionalDescription: null,
        category: null,
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
        transactionDate: TXN_DATE,
        description: "Expense",
        additionalDescription: null,
        category: null,
        ...overrides,
    });

    beforeEach(async () => {
        transactions = [income(), expense(), income({ id: "income-2" }), expense({ id: "expense-2" })];
        allocations = [];

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                ReimbursementsService,
                { provide: PrismaService, useValue: mockPrismaService },
                { provide: REIMBURSEMENT_SUGGESTION_SOURCES, useValue: [new AmountRuleSource()] },
            ],
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

    describe("getCandidates", () => {
        const ids = (rows: { id: string }[]) => rows.map((r) => r.id);
        const candidateWheres = () =>
            mockPrismaService.transaction.findMany.mock.calls.map((call) => JSON.stringify(call[0].where));

        it("suggests expenses at least as large as an income, with equal amounts included", async () => {
            transactions.push(
                expense({ id: "expense-equal", amount: 500 }),
                expense({ id: "expense-small", amount: 300 }),
            );

            const result = await service.getCandidates(USER, "income-1");

            expect(ids(result.suggested)).toContain("expense-equal");
            expect(ids(result.other)).toContain("expense-small");
            const wheres = candidateWheres().join(" ");
            expect(wheres).toContain('"amount":{"gte":500}');
            expect(wheres).not.toMatch(/"amount":\{"gt"/);
            expect(wheres).toContain('"NOT"');
        });

        it("suggests incomes no larger than an expense", async () => {
            transactions.push(income({ id: "income-small", amount: 400 }), income({ id: "income-big", amount: 700 }));

            const result = await service.getCandidates(USER, "expense-1");

            expect(ids(result.suggested)).toContain("income-small");
            expect(ids(result.other)).toContain("income-big");
            const wheres = candidateWheres().join(" ");
            expect(wheres).toContain('"amount":{"lte":600}');
            expect(wheres).not.toMatch(/"amount":\{"lt"/);
        });

        it("excludes a candidate already linked to the source", async () => {
            transactions.push(expense({ id: "expense-linked", amount: 700 }));
            allocations = [
                { id: "alloc-1", userId: USER, incomeId: "income-1", expenseId: "expense-linked", amount: 100 },
            ];

            const result = await service.getCandidates(USER, "income-1");

            expect([...ids(result.suggested), ...ids(result.other)]).not.toContain("expense-linked");
        });

        it("drops a fully allocated candidate and reports the remaining balance of the others", async () => {
            transactions.push(
                expense({ id: "expense-full", amount: 400 }),
                expense({ id: "expense-part", amount: 600 }),
            );
            allocations = [
                { id: "a-full", userId: USER, incomeId: "income-2", expenseId: "expense-full", amount: 400 },
                { id: "a-part", userId: USER, incomeId: "income-2", expenseId: "expense-part", amount: 150 },
            ];

            const result = await service.getCandidates(USER, "income-1");

            const all = [...result.suggested, ...result.other];
            expect(ids(all)).not.toContain("expense-full");
            expect(all.find((c) => c.id === "expense-part")).toMatchObject({ amount: 600, remaining: 450 });
        });

        it("reports the source remaining after its own allocations", async () => {
            allocations = [{ id: "a-1", userId: USER, incomeId: "income-1", expenseId: "expense-2", amount: 120 }];

            const result = await service.getCandidates(USER, "income-1");

            expect(result.source).toMatchObject({ id: "income-1", type: "income", amount: 500, remaining: 380 });
            expect(ids([...result.suggested, ...result.other])).not.toContain("expense-2");
        });

        it("orders candidates by distance from the source date across before and after windows", async () => {
            const at = (id: string, date: string) =>
                expense({ id, amount: 700, transactionDate: new Date(`${date}T00:00:00Z`) });
            transactions.push(
                at("e-after-far", "2026-11-01"),
                at("e-before-far", "2026-09-01"),
                at("e-after-near", "2026-10-12"),
                at("e-before-near", "2026-10-09"),
            );

            const result = await service.getCandidates(USER, "income-1");

            // Distances from 2026-10-10: 1, 2, 22 (after-far) and 39 (before-far) days.
            const ordered = ids(result.suggested).filter((id) => id.startsWith("e-"));
            expect(ordered).toEqual(["e-before-near", "e-after-near", "e-after-far", "e-before-far"]);
        });

        it("adds text matches and the amount equality for an amount search", async () => {
            transactions.push(
                expense({ id: "expense-1200", amount: 1200, description: "Shop" }),
                expense({ id: "expense-taizu", amount: 800, description: "Taizu dinner" }),
            );

            const result = await service.getCandidates(USER, "income-1", "₪1,200");

            expect(ids(result.suggested)).toEqual(["expense-1200"]);
            expect(candidateWheres().join(" ")).toContain('{"amount":1200}');
        });

        it("matches text only for a non-numeric search", async () => {
            transactions.push(
                expense({ id: "expense-1200", amount: 1200, description: "Shop" }),
                expense({ id: "expense-taizu", amount: 800, description: "Taizu dinner" }),
            );

            const result = await service.getCandidates(USER, "income-1", "taizu");

            expect(ids(result.suggested)).toEqual(["expense-taizu"]);
            expect(candidateWheres().join(" ")).not.toContain('{"amount":1200}');
        });

        it("returns 404 when the source is not owned by the user", async () => {
            transactions.push(income({ id: "income-other", userId: OTHER_USER }));

            await expect(service.getCandidates(USER, "income-other")).rejects.toThrow(NotFoundException);
        });

        it("rejects a transfer source", async () => {
            transactions.push(expense({ id: "transfer-1", type: "transfer" }));

            await expect(service.getCandidates(USER, "transfer-1")).rejects.toThrow(BadRequestException);
        });

        it("rejects a hidden source", async () => {
            transactions.push(income({ id: "income-hidden", hidden: true }));

            await expect(service.getCandidates(USER, "income-hidden")).rejects.toThrow(
                "Unhide this transaction to link reimbursements.",
            );
        });
    });
});
