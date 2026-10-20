import { Prisma } from "@prisma/client";
import { faker } from "@faker-js/faker";
import {
    buildDemoAtmWithdrawal,
    generateDemoTransactions,
    DEMO_EXTERNAL_ID_PREFIX,
    DemoDb,
    DemoDataContext,
} from "./demo-data.generator";
import { demoAtmDay, demoWindowStart } from "./demo-dates";
import {
    CASH_WITHDRAWAL_LABEL,
    DEMO_ATM_AMOUNTS,
    DEMO_ATM_DESCRIPTION,
    SALARY_CATEGORY,
    CARD_PAYOFF_DESCRIPTION,
    NEEDS_CATEGORIES,
    WANTS_CATEGORIES,
} from "./demo-data.constants";

function makeDb() {
    return {
        transaction: {
            createMany: jest.fn().mockResolvedValue({ count: 0 }),
            aggregate: jest.fn().mockResolvedValue({ _sum: { amount: null } }),
        },
    } as unknown as DemoDb & { transaction: { createMany: jest.Mock; aggregate: jest.Mock } };
}

function makeCtx(): DemoDataContext {
    const categoryIds = new Map<string, string>();
    for (const cat of [...NEEDS_CATEGORIES, ...WANTS_CATEGORIES, SALARY_CATEGORY]) {
        categoryIds.set(cat.name, `cat-${cat.name}`);
    }
    return {
        userId: "user-1",
        currencyId: "ils",
        bankAccountId: "bank-1",
        creditCardId: "card-1",
        categoryIds,
    };
}

function collectRows(db: ReturnType<typeof makeDb>): Prisma.TransactionCreateManyInput[] {
    return db.transaction.createMany.mock.calls.flatMap((call) => call[0].data as Prisma.TransactionCreateManyInput[]);
}

beforeEach(() => {
    faker.seed(42);
});

describe("generateDemoTransactions", () => {
    it("from > to returns 0 without any DB calls", async () => {
        const db = makeDb();
        const from = new Date(Date.UTC(2026, 5, 1));
        const to = new Date(Date.UTC(2026, 4, 1));
        const result = await generateDemoTransactions(db, makeCtx(), from, to);
        expect(result).toBe(0);
        expect(db.transaction.createMany).not.toHaveBeenCalled();
        expect(db.transaction.aggregate).not.toHaveBeenCalled();
    });

    it("full window: no future rows, one salary per eligible month, chronological monthly writes", async () => {
        const db = makeDb();
        const today = new Date(Date.UTC(2026, 8, 25));
        const from = demoWindowStart(today);

        const total = await generateDemoTransactions(db, makeCtx(), from, today);
        const rows = collectRows(db);

        expect(total).toBe(rows.length);
        expect(rows.length).toBeGreaterThan(0);

        for (const row of rows) {
            expect((row.transactionDate as Date).getTime()).toBeLessThanOrEqual(today.getTime());
            expect((row.postedDate as Date).getTime()).toBeLessThanOrEqual(today.getTime());
            expect((row.transactionDate as Date).getTime()).toBeGreaterThanOrEqual(from.getTime());
        }

        const salaryRows = rows.filter((r) => r.type === "income");
        const salaryMonths = new Set(
            salaryRows.map(
                (r) => `${(r.transactionDate as Date).getUTCFullYear()}-${(r.transactionDate as Date).getUTCMonth()}`,
            ),
        );
        expect(salaryMonths.size).toBe(salaryRows.length); // at most one salary per month

        // Chronological, one createMany call per iterated month: every call's rows belong to a
        // single UTC year-month, and those months strictly increase call-over-call.
        const monthKey = (d: Date) => d.getUTCFullYear() * 12 + d.getUTCMonth();
        const createManyCalls = db.transaction.createMany.mock.calls.map((call, i) => {
            const data = call[0].data as Prisma.TransactionCreateManyInput[];
            const months = new Set(data.map((r) => monthKey(r.transactionDate as Date)));
            expect(months.size).toBe(1); // all rows in one call share the same month
            return {
                month: [...months][0],
                order: db.transaction.createMany.mock.invocationCallOrder[i],
            };
        });
        expect(createManyCalls.length).toBeGreaterThan(0);
        for (let i = 1; i < createManyCalls.length; i++) {
            expect(createManyCalls[i].month).toBeGreaterThan(createManyCalls[i - 1].month);
        }

        // Each card-payoff aggregate must run after the createMany of the month it sums, so it
        // sees that month's expenses already persisted (a real DB would otherwise total 0).
        db.transaction.aggregate.mock.calls.forEach((call, i) => {
            const where = call[0].where as { transactionDate: { gte: Date } };
            const summedMonth = monthKey(where.transactionDate.gte);
            const summedMonthWrite = createManyCalls.find((c) => c.month === summedMonth);
            if (summedMonthWrite) {
                const aggOrder = db.transaction.aggregate.mock.invocationCallOrder[i];
                expect(aggOrder).toBeGreaterThan(summedMonthWrite.order);
            }
        });
    });

    it("card payoff: creates one hidden transfer sized from the aggregate, rounded to 2dp", async () => {
        const db = makeDb();
        db.transaction.aggregate.mockResolvedValue({ _sum: { amount: new Prisma.Decimal("1234.567") } });

        const from = new Date(Date.UTC(2026, 2, 10)); // covers the 15th
        const to = new Date(Date.UTC(2026, 2, 20));
        await generateDemoTransactions(db, makeCtx(), from, to);
        const rows = collectRows(db);

        const transfers = rows.filter((r) => r.type === "transfer");
        expect(transfers).toHaveLength(1);
        expect(transfers[0]).toMatchObject({
            hidden: true,
            transferDirection: "out",
            amount: 1234.57,
            description: CARD_PAYOFF_DESCRIPTION,
        });

        expect(db.transaction.aggregate).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    accountId: "card-1",
                    type: "expense",
                    deletedAt: null,
                    transactionDate: {
                        gte: new Date(Date.UTC(2026, 1, 1)),
                        lte: new Date(Date.UTC(2026, 1, 28)),
                    },
                }),
            }),
        );
    });

    it("no card payoff when the previous month's aggregate is zero or null", async () => {
        const db = makeDb();
        db.transaction.aggregate.mockResolvedValue({ _sum: { amount: new Prisma.Decimal(0) } });

        const from = new Date(Date.UTC(2026, 2, 10));
        const to = new Date(Date.UTC(2026, 2, 20));
        await generateDemoTransactions(db, makeCtx(), from, to);
        const rows = collectRows(db);

        expect(rows.filter((r) => r.type === "transfer")).toHaveLength(0);
    });

    it("no salary when the range excludes the salary day", async () => {
        const db = makeDb();
        // Range starting the 20th of a month can't include any day 1..5.
        const from = new Date(Date.UTC(2026, 2, 20));
        const to = new Date(Date.UTC(2026, 2, 25));
        await generateDemoTransactions(db, makeCtx(), from, to);
        const rows = collectRows(db);

        expect(rows.filter((r) => r.type === "income")).toHaveLength(0);
    });

    it("1-day range: all expense rows land on that day, posted date clamped to it", async () => {
        const db = makeDb();
        // Avoid the 15th (payoff) and any day 1..5 (salary) so only expenses can appear; a
        // 28-day February keeps the expense-count roll deterministic under faker.seed(42).
        const day = new Date(Date.UTC(2026, 1, 20));
        await generateDemoTransactions(db, makeCtx(), day, day);
        const rows = collectRows(db);

        expect(rows.length).toBeGreaterThan(0);
        for (const row of rows) {
            expect((row.transactionDate as Date).getTime()).toBe(day.getTime());
            expect((row.postedDate as Date).getTime()).toBe(day.getTime());
        }
    });

    it("synced-looking rows get unique demo- externalIds; cash rows are manual", async () => {
        const db = makeDb();
        db.transaction.aggregate.mockResolvedValue({ _sum: { amount: new Prisma.Decimal(500) } });
        const today = new Date(Date.UTC(2026, 8, 25));
        await generateDemoTransactions(db, makeCtx(), demoWindowStart(today), today);
        const rows = collectRows(db);

        const cash = rows.filter((r) => String(r.description).startsWith("Cash – "));
        const synced = rows.filter((r) => !String(r.description).startsWith("Cash – "));
        expect(cash.length).toBeGreaterThan(0);
        expect(synced.some((r) => r.type === "income")).toBe(true);
        expect(synced.some((r) => r.type === "transfer")).toBe(true);
        expect(synced.some((r) => r.accountId === "card-1")).toBe(true);

        for (const r of synced) expect(r.externalId).toMatch(new RegExp(`^${DEMO_EXTERNAL_ID_PREFIX}`));
        const ids = synced.map((r) => r.externalId);
        expect(new Set(ids).size).toBe(ids.length);

        for (const r of cash) {
            expect(r.accountId).toBe("bank-1");
            expect(r.type).toBe("expense");
            expect(r.externalId).toBeUndefined();
            expect(r.hidden).toBeFalsy();
        }
    });

    it("a full month yields 1-3 cash rows", async () => {
        for (let i = 0; i < 20; i++) {
            const db = makeDb();
            await generateDemoTransactions(
                db,
                makeCtx(),
                new Date(Date.UTC(2026, 2, 1)),
                new Date(Date.UTC(2026, 2, 31)),
            );
            const cash = collectRows(db).filter((r) => String(r.description).startsWith("Cash – "));
            expect(cash.length).toBeGreaterThanOrEqual(1);
            expect(cash.length).toBeLessThanOrEqual(3);
        }
    });
});

describe("synced ATM withdrawal", () => {
    const atmRows = (db: ReturnType<typeof makeDb>) =>
        collectRows(db).filter((r) => r.description === DEMO_ATM_DESCRIPTION);

    it("yields one labelled card expense per full month", async () => {
        const db = makeDb();
        await generateDemoTransactions(db, makeCtx(), new Date(Date.UTC(2026, 0, 1)), new Date(Date.UTC(2026, 5, 30)));
        const rows = atmRows(db);

        expect(rows).toHaveLength(6);
        for (const r of rows) {
            expect(r.accountId).toBe("card-1");
            expect(r.type).toBe("expense");
            expect(r.categoryId).toBeNull();
            expect(r.additionalDescription).toBe(CASH_WITHDRAWAL_LABEL);
            expect(r.externalId).toMatch(new RegExp(`^${DEMO_EXTERNAL_ID_PREFIX}`));
            expect(DEMO_ATM_AMOUNTS).toContain(r.amount);
        }
    });

    it("yields none for a range that excludes the ATM day", async () => {
        const day = demoAtmDay(2026, 2);
        const db = makeDb();
        await generateDemoTransactions(
            db,
            makeCtx(),
            new Date(Date.UTC(2026, 2, day + 1)),
            new Date(Date.UTC(2026, 2, 28)),
        );
        expect(atmRows(db)).toHaveLength(0);
    });

    it("clamps the posted date to `to`", () => {
        const date = new Date(Date.UTC(2026, 2, 10));
        const row = buildDemoAtmWithdrawal(makeCtx(), date, date);
        expect((row.postedDate as Date).getTime()).toBe(date.getTime());
    });
});
