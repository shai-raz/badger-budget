import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { faker } from "@faker-js/faker";
import {
    EXPENSE_CONFIG,
    CASH_EXPENSES,
    SALARY_CATEGORY,
    SALARY_DESCRIPTION,
    CARD_PAYOFF_DESCRIPTION,
    CASH_WITHDRAWAL_LABEL,
    DEMO_ATM_AMOUNTS,
    DEMO_ATM_DESCRIPTION,
} from "./demo-data.constants";
import { addDaysUtc, endOfMonthUtc, startOfMonthUtc, demoSalaryDay, demoAtmDay } from "./demo-dates";

// Narrowest slice of the Prisma client the generator needs — satisfied by PrismaClient,
// PrismaService, and the `tx` handed to a `$transaction` callback alike.
export type DemoDb = Pick<Prisma.TransactionClient, "transaction">;

export interface DemoDataContext {
    userId: string;
    currencyId: string;
    bankAccountId: string;
    creditCardId: string;
    /** category name -> id */
    categoryIds: Map<string, string>;
}

// Synthetic externalId marking a demo row as "synced" (so the edit lock applies to it). randomUUID
// rather than faker, so the seeded faker sequence isn't disturbed.
export const DEMO_EXTERNAL_ID_PREFIX = "demo-";
export const demoExternalId = () => `${DEMO_EXTERNAL_ID_PREFIX}${randomUUID()}`;

const round2 = (n: number) => Math.round(n * 100) / 100;

// Weighted pool of expense category names for realistic distribution.
const expensePool: string[] = [];
for (const [name, cfg] of Object.entries(EXPENSE_CONFIG)) {
    for (let i = 0; i < cfg.weight; i++) expensePool.push(name);
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * A synced card ATM withdrawal on `date`: amount picked deterministically from `DEMO_ATM_AMOUNTS` by
 * month (no faker, so the seeded faker sequence is undisturbed), labelled like Cal's cash withdrawals.
 */
export function buildDemoAtmWithdrawal(ctx: DemoDataContext, date: Date, to: Date): Prisma.TransactionCreateManyInput {
    const nextDay = addDaysUtc(date, 1);
    return {
        userId: ctx.userId,
        accountId: ctx.creditCardId,
        categoryId: null,
        type: "expense",
        amount: DEMO_ATM_AMOUNTS[(date.getUTCFullYear() * 12 + date.getUTCMonth()) % DEMO_ATM_AMOUNTS.length],
        currencyId: ctx.currencyId,
        description: DEMO_ATM_DESCRIPTION,
        additionalDescription: CASH_WITHDRAWAL_LABEL,
        externalId: demoExternalId(),
        transactionDate: date,
        postedDate: nextDay.getTime() > to.getTime() ? to : nextDay,
    };
}

/**
 * Generates realistic demo transactions (salary, card payoffs, weighted card expenses, one synced card ATM
 * withdrawal a month, manual cash expenses) for every
 * calendar month overlapping `[from, to]` (both UTC-midnight dates, inclusive). Writes are done
 * one month at a time, in chronological order, so each month's card-payoff aggregate sees the
 * previous month's expenses already persisted. Salary, payoff and card rows get a synthetic `demo-`
 * externalId (they read as synced); cash rows have none (manual). Returns the number of rows created.
 */
export async function generateDemoTransactions(
    db: DemoDb,
    ctx: DemoDataContext,
    from: Date,
    to: Date,
): Promise<number> {
    if (from.getTime() > to.getTime()) return 0;

    const { userId, currencyId, bankAccountId, creditCardId, categoryIds } = ctx;
    let created = 0;

    let monthStart = startOfMonthUtc(from);
    const lastMonthStart = startOfMonthUtc(to);

    while (monthStart.getTime() <= lastMonthStart.getTime()) {
        const year = monthStart.getUTCFullYear();
        const month = monthStart.getUTCMonth();
        const monthEnd = endOfMonthUtc(monthStart);
        const daysInMonth = monthEnd.getUTCDate();

        const rangeStart = monthStart.getTime() > from.getTime() ? monthStart : from;
        const rangeEnd = monthEnd.getTime() < to.getTime() ? monthEnd : to;

        const rows: Prisma.TransactionCreateManyInput[] = [];

        // Salary income (bank account), paid on a deterministic day early in the month.
        const salaryDate = new Date(Date.UTC(year, month, demoSalaryDay(year, month)));
        if (salaryDate.getTime() >= rangeStart.getTime() && salaryDate.getTime() <= rangeEnd.getTime()) {
            rows.push({
                userId,
                accountId: bankAccountId,
                categoryId: categoryIds.get(SALARY_CATEGORY.name) ?? null,
                type: "income",
                amount: round2(faker.number.float({ min: 14000, max: 16000, fractionDigits: 2 })),
                currencyId,
                description: SALARY_DESCRIPTION,
                externalId: demoExternalId(),
                transactionDate: salaryDate,
                postedDate: salaryDate,
            });
        }

        // Card payoff (bank account) settling the previous month's card spend — a hidden outbound
        // transfer, matching what the card payoff patterns produce.
        const payoffDate = new Date(Date.UTC(year, month, 15));
        if (payoffDate.getTime() >= rangeStart.getTime() && payoffDate.getTime() <= rangeEnd.getTime()) {
            const prevMonthStart = new Date(Date.UTC(year, month - 1, 1));
            const prevMonthEnd = endOfMonthUtc(prevMonthStart);
            const agg = await db.transaction.aggregate({
                _sum: { amount: true },
                where: {
                    userId,
                    accountId: creditCardId,
                    type: "expense",
                    deletedAt: null,
                    transactionDate: { gte: prevMonthStart, lte: prevMonthEnd },
                },
            });
            const total = round2(Number(agg._sum.amount ?? 0));
            if (total > 0) {
                rows.push({
                    userId,
                    accountId: bankAccountId,
                    type: "transfer",
                    hidden: true,
                    transferDirection: "out",
                    amount: total,
                    currencyId,
                    description: CARD_PAYOFF_DESCRIPTION,
                    externalId: demoExternalId(),
                    transactionDate: payoffDate,
                    postedDate: payoffDate,
                });
            }
        }

        // Weighted expenses on the credit card, scaled down for a partial-month range.
        const coveredDays = Math.round((rangeEnd.getTime() - rangeStart.getTime()) / DAY_MS) + 1;
        const monthly = faker.number.int({ min: 26, max: 32 });
        const expected = (monthly * coveredDays) / daysInMonth;
        const base = Math.floor(expected);
        const count = base + (faker.number.float({ min: 0, max: 1 }) < expected - base ? 1 : 0);

        for (let e = 0; e < count; e++) {
            const catName = faker.helpers.arrayElement(expensePool);
            const cfg = EXPENSE_CONFIG[catName];
            const amount = round2(faker.number.float({ min: cfg.min, max: cfg.max, fractionDigits: 2 }));

            const offset = faker.number.int({ min: 0, max: coveredDays - 1 });
            const txDate = addDaysUtc(rangeStart, offset);
            let posted = addDaysUtc(txDate, faker.number.int({ min: 1, max: 3 }));
            if (posted.getTime() > to.getTime()) posted = to;

            rows.push({
                userId,
                accountId: creditCardId,
                categoryId: categoryIds.get(catName) ?? null,
                type: "expense",
                amount,
                currencyId,
                description: faker.helpers.arrayElement(cfg.merchants),
                externalId: demoExternalId(),
                transactionDate: txDate,
                postedDate: posted,
            });
        }

        // Synced card ATM withdrawal, on a deterministic day (no faker).
        const atmDate = new Date(Date.UTC(year, month, demoAtmDay(year, month)));
        if (atmDate.getTime() >= rangeStart.getTime() && atmDate.getTime() <= rangeEnd.getTime()) {
            rows.push(buildDemoAtmWithdrawal(ctx, atmDate, to));
        }

        // Manual cash expenses on the bank account: no externalId, so they stay fully editable.
        const monthlyCash = faker.number.int({ min: 1, max: 3 });
        const expectedCash = (monthlyCash * coveredDays) / daysInMonth;
        const baseCash = Math.floor(expectedCash);
        const cashCount = baseCash + (faker.number.float({ min: 0, max: 1 }) < expectedCash - baseCash ? 1 : 0);

        for (let c = 0; c < cashCount; c++) {
            const entry = faker.helpers.arrayElement(CASH_EXPENSES);
            const amount = round2(faker.number.float({ min: entry.min, max: entry.max, fractionDigits: 2 }));
            const d = addDaysUtc(rangeStart, faker.number.int({ min: 0, max: coveredDays - 1 }));

            rows.push({
                userId,
                accountId: bankAccountId,
                categoryId: categoryIds.get(entry.category) ?? null,
                type: "expense",
                amount,
                currencyId,
                description: entry.description,
                transactionDate: d,
                postedDate: d,
            });
        }

        if (rows.length) {
            await db.transaction.createMany({ data: rows });
            created += rows.length;
        }

        monthStart = new Date(Date.UTC(year, month + 1, 1));
    }

    return created;
}
