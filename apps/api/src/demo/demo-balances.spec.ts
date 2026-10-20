import { faker } from "@faker-js/faker";
import { Prisma } from "@prisma/client";
import { ensureDemoBalanceAccounts, refreshDemoBalances, DemoBalanceAccountIds, DemoBalanceDb } from "./demo-balances";
import { DEMO_CAL_CARD_NAME, DEMO_NO_LIMIT_CARD_NAME, DEMO_SAVINGS_ACCOUNT_NAME } from "./demo-data.constants";

function makeDb() {
    return {
        account: {
            findMany: jest.fn().mockResolvedValue([]),
            create: jest.fn(({ data }: { data: { name: string } }) =>
                Promise.resolve({ id: `new-${data.name}`, ...data }),
            ),
            update: jest.fn().mockResolvedValue({}),
        },
        transaction: {
            aggregate: jest.fn().mockResolvedValue({ _sum: { amount: null } }),
        },
    } as unknown as DemoBalanceDb & {
        account: { findMany: jest.Mock; create: jest.Mock; update: jest.Mock };
        transaction: { aggregate: jest.Mock };
    };
}

beforeEach(() => {
    faker.seed(42);
});

describe("ensureDemoBalanceAccounts", () => {
    it("creates all 3 new balance accounts when none exist", async () => {
        const db = makeDb();

        const ids = await ensureDemoBalanceAccounts(db, "user-1", "ils-1");

        expect(db.account.create).toHaveBeenCalledTimes(3);
        expect(db.account.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({ name: DEMO_SAVINGS_ACCOUNT_NAME, type: "bank" }),
            }),
        );
        expect(db.account.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({ name: DEMO_CAL_CARD_NAME, type: "credit_card" }),
            }),
        );
        expect(db.account.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({ name: DEMO_NO_LIMIT_CARD_NAME, type: "credit_card" }),
            }),
        );
        expect(ids.savingsAccountId).toBe(`new-${DEMO_SAVINGS_ACCOUNT_NAME}`);
        expect(ids.calCardId).toBe(`new-${DEMO_CAL_CARD_NAME}`);
        expect(ids.noLimitCardId).toBe(`new-${DEMO_NO_LIMIT_CARD_NAME}`);
    });

    it("only creates the accounts that are missing, and returns existing ids for the rest", async () => {
        const db = makeDb();
        db.account.findMany.mockResolvedValue([{ id: "existing-savings", name: DEMO_SAVINGS_ACCOUNT_NAME }]);

        const ids = await ensureDemoBalanceAccounts(db, "user-1", "ils-1");

        expect(db.account.create).toHaveBeenCalledTimes(2);
        expect(ids.savingsAccountId).toBe("existing-savings");
        expect(ids.calCardId).toBe(`new-${DEMO_CAL_CARD_NAME}`);
        expect(ids.noLimitCardId).toBe(`new-${DEMO_NO_LIMIT_CARD_NAME}`);
    });

    it("creates nothing when all 3 already exist", async () => {
        const db = makeDb();
        db.account.findMany.mockResolvedValue([
            { id: "s", name: DEMO_SAVINGS_ACCOUNT_NAME },
            { id: "c", name: DEMO_CAL_CARD_NAME },
            { id: "n", name: DEMO_NO_LIMIT_CARD_NAME },
        ]);

        const ids = await ensureDemoBalanceAccounts(db, "user-1", "ils-1");

        expect(db.account.create).not.toHaveBeenCalled();
        expect(ids).toEqual({ savingsAccountId: "s", calCardId: "c", noLimitCardId: "n" });
    });
});

describe("refreshDemoBalances", () => {
    const ids: DemoBalanceAccountIds = {
        bankAccountId: "bank-1",
        savingsAccountId: "savings-1",
        creditCardId: "card-1",
        calCardId: "cal-1",
        noLimitCardId: "nolimit-1",
    };
    const now = new Date(Date.UTC(2026, 5, 20));

    function amountsByType(sums: Record<string, number | null>) {
        return (args: { where: { type: string; accountId: string; transferDirection?: string } }) => {
            const key =
                args.where.type === "transfer"
                    ? `transfer-${args.where.transferDirection}`
                    : `${args.where.type}-${args.where.accountId}`;
            const amount = sums[key];
            return Promise.resolve({
                _sum: { amount: amount === null || amount === undefined ? null : new Prisma.Decimal(amount) },
            });
        };
    }

    it("computes the bank account's ledger balance from income/expense/transfer aggregates", async () => {
        const db = makeDb();
        db.transaction.aggregate.mockImplementation(
            amountsByType({
                "income-bank-1": 180000,
                "expense-bank-1": 0,
                "transfer-out": 40000,
                "transfer-in": 0,
                "expense-card-1": null,
            }),
        );

        await refreshDemoBalances(db, "user-1", ids, now);

        const bankUpdate = db.account.update.mock.calls.find((c) => c[0].where.id === "bank-1")![0];
        expect(bankUpdate.data.balance.toNumber()).toBe(140000);
        expect(bankUpdate.data.balanceKind).toBe("account_balance");
        expect(bankUpdate.data.cardFrame).toBeNull();
        expect(bankUpdate.data.balanceUpdatedAt).toBe(now);
    });

    it("floors the bank balance at 500 so a negative ledger never shows", async () => {
        const db = makeDb();
        db.transaction.aggregate.mockImplementation(
            amountsByType({
                "income-bank-1": 100,
                "expense-bank-1": 0,
                "transfer-out": 5000,
                "transfer-in": 0,
            }),
        );

        await refreshDemoBalances(db, "user-1", ids, now);

        const bankUpdate = db.account.update.mock.calls.find((c) => c[0].where.id === "bank-1")![0];
        expect(bankUpdate.data.balance.toNumber()).toBe(500);
    });

    it("stores the card's utilized_credit negative, with a cardFrame sized from the utilization %", async () => {
        const db = makeDb();
        db.transaction.aggregate.mockImplementation(
            amountsByType({
                "income-bank-1": 0,
                "expense-bank-1": 0,
                "transfer-out": 0,
                "transfer-in": 0,
                "expense-card-1": 1000,
            }),
        );

        await refreshDemoBalances(db, "user-1", ids, now);

        const cardUpdate = db.account.update.mock.calls.find((c) => c[0].where.id === "card-1")![0];
        expect(cardUpdate.data.balanceKind).toBe("utilized_credit");
        expect(cardUpdate.data.balance.toNumber()).toBe(-1000);
        const frame = cardUpdate.data.cardFrame.toNumber();
        expect(frame % 1000).toBe(0);
        expect(frame).toBeGreaterThanOrEqual(2500); // 1000 / 0.4
        expect(frame).toBeLessThanOrEqual(6000); // 1000 / 0.2, rounded up
        expect(cardUpdate.data.balanceDate).toBeNull();
    });

    it("sets the Cal card's next_charge negative, with an upcoming (never past) balanceDate", async () => {
        const db = makeDb();

        await refreshDemoBalances(db, "user-1", ids, now);

        const calUpdate = db.account.update.mock.calls.find((c) => c[0].where.id === "cal-1")![0];
        expect(calUpdate.data.balanceKind).toBe("next_charge");
        expect(calUpdate.data.balance.toNumber()).toBeLessThan(0);
        expect(calUpdate.data.cardFrame).toBeNull();
        expect((calUpdate.data.balanceDate as Date).getTime()).toBeGreaterThanOrEqual(now.getTime());
    });

    it("sets the no-limit card's utilized_credit negative with no cardFrame", async () => {
        const db = makeDb();

        await refreshDemoBalances(db, "user-1", ids, now);

        const noLimitUpdate = db.account.update.mock.calls.find((c) => c[0].where.id === "nolimit-1")![0];
        expect(noLimitUpdate.data.balanceKind).toBe("utilized_credit");
        expect(noLimitUpdate.data.balance.toNumber()).toBeLessThan(0);
        expect(noLimitUpdate.data.cardFrame).toBeNull();
    });

    it("keeps the savings balance a positive account_balance within its clamped range", async () => {
        const db = makeDb();
        db.transaction.aggregate.mockImplementation(
            amountsByType({
                "income-bank-1": 180000,
                "expense-bank-1": 0,
                "transfer-out": 40000,
                "transfer-in": 0,
            }),
        );

        await refreshDemoBalances(db, "user-1", ids, now);

        const savingsUpdate = db.account.update.mock.calls.find((c) => c[0].where.id === "savings-1")![0];
        expect(savingsUpdate.data.balanceKind).toBe("account_balance");
        const savings = savingsUpdate.data.balance.toNumber();
        expect(savings).toBeGreaterThanOrEqual(5000);
        expect(savings).toBeLessThanOrEqual(80000);
    });

    it("updates all 5 accounts", async () => {
        const db = makeDb();

        await refreshDemoBalances(db, "user-1", ids, now);

        expect(db.account.update).toHaveBeenCalledTimes(5);
    });
});
