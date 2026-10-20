import { Test, TestingModule } from "@nestjs/testing";
import { DemoService } from "./demo.service";
import { PrismaService } from "../prisma/prisma.service";
import { generateDemoTransactions } from "./demo-data.generator";
import { ensureDemoBalanceAccounts, refreshDemoBalances } from "./demo-balances";
import {
    DEMO_BANK_ACCOUNT_NAME,
    DEMO_CARD_ACCOUNT_NAME,
    CASH_WITHDRAWAL_LABEL,
    DEMO_ATM_DESCRIPTION,
    SALARY_CATEGORY,
    SALARY_DESCRIPTION,
} from "./demo-data.constants";

jest.mock("./demo-data.generator", () => ({
    buildDemoAtmWithdrawal: jest.requireActual("./demo-data.generator").buildDemoAtmWithdrawal,
    generateDemoTransactions: jest.fn().mockResolvedValue(5),
    DEMO_EXTERNAL_ID_PREFIX: "demo-",
}));

// Balance refresh is covered end to end by demo-balances.spec.ts against the real
// implementation; here it's mocked out so these tests can focus on the transaction top-up.
jest.mock("./demo-balances", () => ({
    ensureDemoBalanceAccounts: jest
        .fn()
        .mockResolvedValue({ savingsAccountId: "savings-1", calCardId: "cal-1", noLimitCardId: "nolimit-1" }),
    refreshDemoBalances: jest.fn().mockResolvedValue(undefined),
}));

const mockGenerate = generateDemoTransactions as jest.Mock;
const mockEnsureBalanceAccounts = ensureDemoBalanceAccounts as jest.Mock;
const mockRefreshBalances = refreshDemoBalances as jest.Mock;

describe("DemoService", () => {
    let service: DemoService;

    // now = 2026-09-25T12:00 local -> today (UTC-midnight) = 2026-09-25Z
    const now = new Date(2026, 8, 25, 12);
    const today = new Date(Date.UTC(2026, 8, 25));
    const windowStart = new Date(Date.UTC(2025, 9, 1)); // 2025-10-01Z (12 months incl. Sep 2026)
    const userId = "demo-user-1";

    const bankAccount = { id: "bank-1", userId, name: DEMO_BANK_ACCOUNT_NAME, currencyId: "ils-1", deletedAt: null };
    const cardAccount = { id: "card-1", userId, name: DEMO_CARD_ACCOUNT_NAME, currencyId: "ils-1", deletedAt: null };
    const categories = [
        { id: "cat-salary", name: SALARY_CATEGORY.name },
        { id: "cat-groceries", name: "Groceries" },
    ];

    let mockTx: {
        user: { updateMany: jest.Mock; update: jest.Mock };
        account: { findMany: jest.Mock };
        category: { findMany: jest.Mock };
        currency: { findUnique: jest.Mock };
        transaction: { findFirst: jest.Mock; deleteMany: jest.Mock; createMany: jest.Mock };
    };

    let mockPrisma: {
        user: { findUnique: jest.Mock };
        transaction: { findFirst: jest.Mock };
        $transaction: jest.Mock;
    };

    beforeEach(async () => {
        mockTx = {
            user: { updateMany: jest.fn().mockResolvedValue({ count: 1 }), update: jest.fn().mockResolvedValue({}) },
            account: { findMany: jest.fn().mockResolvedValue([bankAccount, cardAccount]) },
            category: { findMany: jest.fn().mockResolvedValue(categories) },
            currency: { findUnique: jest.fn().mockResolvedValue({ id: "ils-1" }) },
            transaction: {
                findFirst: jest.fn().mockResolvedValue(null),
                deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
                createMany: jest.fn().mockResolvedValue({ count: 0 }),
            },
        };

        mockPrisma = {
            user: { findUnique: jest.fn() },
            transaction: { findFirst: jest.fn().mockResolvedValue(null) },
            $transaction: jest.fn((callback: (tx: unknown) => unknown) => callback(mockTx)),
        };

        const module: TestingModule = await Test.createTestingModule({
            providers: [DemoService, { provide: PrismaService, useValue: mockPrisma }],
        }).compile();

        service = module.get<DemoService>(DemoService);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    it("returns null and never generates transactions when watermark == today, but still refreshes balances", async () => {
        mockPrisma.user.findUnique.mockResolvedValue({ demoDataThrough: today });

        const result = await service.topUpIfStale(userId, now);

        expect(result).toBeNull();
        expect(mockGenerate).not.toHaveBeenCalled();
        // Balance refresh runs unconditionally on every call, even when there's nothing to top up.
        // ATM backfill transaction + balance refresh transaction.
        expect(mockPrisma.$transaction).toHaveBeenCalledTimes(2);
        expect(mockEnsureBalanceAccounts).toHaveBeenCalledWith(mockTx, userId, "ils-1");
        expect(mockRefreshBalances).toHaveBeenCalledWith(
            mockTx,
            userId,
            expect.objectContaining({
                bankAccountId: "bank-1",
                creditCardId: "card-1",
                savingsAccountId: "savings-1",
                calCardId: "cal-1",
                noLimitCardId: "nolimit-1",
            }),
            now,
        );
    });

    describe("ATM withdrawal backfill", () => {
        const probe = {
            where: {
                userId,
                additionalDescription: CASH_WITHDRAWAL_LABEL,
                externalId: { startsWith: "demo-" },
            },
            select: { id: true },
        };

        beforeEach(() => {
            mockPrisma.user.findUnique.mockResolvedValue({ demoDataThrough: today });
        });

        it("inserts this and last month's withdrawal, none in the future, when the probe finds nothing", async () => {
            await service.topUpIfStale(userId, now);

            expect(mockTx.transaction.findFirst).toHaveBeenCalledWith(probe);
            expect(mockTx.transaction.createMany).toHaveBeenCalledTimes(1);
            const data = mockTx.transaction.createMany.mock.calls[0][0].data;
            expect(data.length).toBeGreaterThanOrEqual(1);
            for (const row of data) {
                expect(row.description).toBe(DEMO_ATM_DESCRIPTION);
                expect(row.additionalDescription).toBe(CASH_WITHDRAWAL_LABEL);
                expect(row.accountId).toBe("card-1");
                expect(row.transactionDate.getTime()).toBeLessThanOrEqual(today.getTime());
                expect(row.transactionDate.getTime()).toBeGreaterThanOrEqual(windowStart.getTime());
                expect(row.postedDate.getTime()).toBeLessThanOrEqual(today.getTime());
            }
        });

        it("never dates a withdrawal after today", async () => {
            const earlyToday = new Date(Date.UTC(2026, 8, 1));
            mockPrisma.user.findUnique.mockResolvedValue({ demoDataThrough: earlyToday });

            await service.topUpIfStale(userId, new Date(2026, 8, 1, 12));

            const data = mockTx.transaction.createMany.mock.calls[0][0].data;
            expect(data).toHaveLength(1); // only last month's: this month's day is still ahead
            expect(data[0].transactionDate.getUTCMonth()).toBe(7);
        });

        it("skips when a demo cash withdrawal already exists (even a deleted one)", async () => {
            mockTx.transaction.findFirst.mockResolvedValue({ id: "atm-1" });

            await service.topUpIfStale(userId, now);

            expect(mockTx.transaction.findFirst.mock.calls[0][0].where).not.toHaveProperty("deletedAt");
            expect(mockTx.transaction.createMany).not.toHaveBeenCalled();
        });

        it("does not throw when the backfill fails, and still refreshes balances", async () => {
            mockTx.transaction.createMany.mockRejectedValue(new Error("boom"));

            await expect(service.topUpIfStale(userId, now)).resolves.toBeNull();
            expect(mockRefreshBalances).toHaveBeenCalled();
        });
    });

    it("locks the user row before reading accounts in the balance refresh", async () => {
        mockPrisma.user.findUnique.mockResolvedValue({ demoDataThrough: today });

        await service.topUpIfStale(userId, now);

        expect(mockTx.user.update).toHaveBeenCalledWith({
            where: { id: userId },
            data: { updatedAt: expect.any(Date) },
        });
        expect(mockTx.user.update.mock.invocationCallOrder[0]).toBeLessThan(
            mockTx.account.findMany.mock.invocationCallOrder[0],
        );
    });

    it("does not ensure balance accounts when the base bank/card accounts are missing", async () => {
        mockPrisma.user.findUnique.mockResolvedValue({ demoDataThrough: today });
        mockTx.account.findMany.mockResolvedValue([bankAccount]);

        await service.topUpIfStale(userId, now);

        expect(mockEnsureBalanceAccounts).not.toHaveBeenCalled();
        expect(mockRefreshBalances).not.toHaveBeenCalled();
    });

    it("returns null when the user is not found", async () => {
        mockPrisma.user.findUnique.mockResolvedValue(null);

        const result = await service.topUpIfStale(userId, now);

        expect(result).toBeNull();
        expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it("swallows a balance refresh failure without rejecting topUpIfStale", async () => {
        mockPrisma.user.findUnique.mockResolvedValue({ demoDataThrough: today });
        mockRefreshBalances.mockRejectedValueOnce(new Error("boom"));

        await expect(service.topUpIfStale(userId, now)).resolves.toBeNull();
    });

    it("tops up from the day after a stale watermark through today", async () => {
        const stored = new Date(Date.UTC(2026, 8, 20)); // 2026-09-20Z
        mockPrisma.user.findUnique.mockResolvedValue({ demoDataThrough: stored });

        const result = await service.topUpIfStale(userId, now);

        expect(mockTx.user.updateMany).toHaveBeenCalledWith({
            where: { id: userId, demoDataThrough: stored },
            data: { demoDataThrough: today },
        });
        expect(mockGenerate).toHaveBeenCalledWith(
            mockTx,
            expect.objectContaining({ userId, bankAccountId: "bank-1", creditCardId: "card-1", currencyId: "ils-1" }),
            new Date(Date.UTC(2026, 8, 21)),
            today,
        );
        expect(mockTx.transaction.deleteMany).toHaveBeenCalledWith({
            where: { userId, transactionDate: { lt: windowStart } },
        });
        expect(mockRefreshBalances).toHaveBeenCalledTimes(1);
        expect(mockRefreshBalances).toHaveBeenCalledWith(mockTx, userId, expect.anything(), now);
        expect(result).toEqual({ from: new Date(Date.UTC(2026, 8, 21)), to: today, created: 5, trimmed: 0 });
    });

    it("clamps `from` to the window start for a very old watermark", async () => {
        const stored = new Date(Date.UTC(2024, 0, 1)); // 2024-01-01Z
        mockPrisma.user.findUnique.mockResolvedValue({ demoDataThrough: stored });

        await service.topUpIfStale(userId, now);

        expect(mockGenerate).toHaveBeenCalledWith(mockTx, expect.anything(), windowStart, today);
    });

    it("bootstraps from the last salary transaction when demoDataThrough is null", async () => {
        mockPrisma.user.findUnique.mockResolvedValue({ demoDataThrough: null });
        const lastSalaryDate = new Date(Date.UTC(2026, 2, 3)); // 2026-03-03Z
        mockPrisma.transaction.findFirst.mockResolvedValue({ transactionDate: lastSalaryDate });

        await service.topUpIfStale(userId, now);

        expect(mockPrisma.transaction.findFirst).toHaveBeenCalledWith(
            expect.objectContaining({
                where: {
                    userId,
                    description: SALARY_DESCRIPTION,
                    category: { name: SALARY_CATEGORY.name },
                },
                orderBy: { transactionDate: "desc" },
            }),
        );
        expect(mockTx.user.updateMany).toHaveBeenCalledWith({
            where: { id: userId, demoDataThrough: null },
            data: { demoDataThrough: today },
        });
        expect(mockGenerate).toHaveBeenCalledWith(mockTx, expect.anything(), new Date(Date.UTC(2026, 3, 1)), today);
    });

    it("bootstraps to the window start when there's no salary transaction and demoDataThrough is null", async () => {
        mockPrisma.user.findUnique.mockResolvedValue({ demoDataThrough: null });
        mockPrisma.transaction.findFirst.mockResolvedValue(null);

        await service.topUpIfStale(userId, now);

        expect(mockGenerate).toHaveBeenCalledWith(mockTx, expect.anything(), windowStart, today);
    });

    it("generates exactly once and returns null for the loser when two logins race", async () => {
        const stored = new Date(Date.UTC(2026, 8, 20));
        mockPrisma.user.findUnique.mockResolvedValue({ demoDataThrough: stored });
        mockTx.user.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });

        const [first, second] = await Promise.all([
            service.topUpIfStale(userId, now),
            service.topUpIfStale(userId, now),
        ]);

        expect(mockGenerate).toHaveBeenCalledTimes(1);
        const results = [first, second];
        expect(results.filter((r) => r === null)).toHaveLength(1);
        expect(results.some((r) => r !== null)).toBe(true);
        // The loser skips generation but still refreshes balances.
        expect(mockRefreshBalances).toHaveBeenCalledTimes(2);
    });

    it("rejects when the demo Credit Card account is missing, without generating", async () => {
        const stored = new Date(Date.UTC(2026, 8, 20));
        mockPrisma.user.findUnique.mockResolvedValue({ demoDataThrough: stored });
        mockTx.account.findMany.mockResolvedValue([bankAccount]);

        await expect(service.topUpIfStale(userId, now)).rejects.toThrow("Demo accounts not found");
        expect(mockGenerate).not.toHaveBeenCalled();
    });

    describe("one-time reseed", () => {
        const stored = new Date(Date.UTC(2026, 8, 20));
        // Gate probes: 1st findFirst = synced (demo-) row, 2nd = any row.
        const gate = (synced: unknown, any: unknown) =>
            mockPrisma.transaction.findFirst.mockResolvedValueOnce(synced).mockResolvedValueOnce(any);

        it("wipes and regenerates the window when rows exist but none has a demo- id", async () => {
            mockPrisma.user.findUnique.mockResolvedValue({ demoDataThrough: stored });
            gate(null, { id: "t1" });
            mockTx.transaction.deleteMany.mockResolvedValue({ count: 7 });

            const result = await service.topUpIfStale(userId, now);

            expect(mockPrisma.transaction.findFirst).toHaveBeenNthCalledWith(1, {
                where: { userId, externalId: { startsWith: "demo-" } },
                select: { id: true },
            });
            expect(mockTx.user.updateMany).toHaveBeenCalledWith({
                where: { id: userId, demoDataThrough: stored },
                data: { demoDataThrough: today },
            });
            expect(mockTx.transaction.deleteMany).toHaveBeenCalledTimes(1);
            expect(mockTx.transaction.deleteMany).toHaveBeenCalledWith({ where: { userId } });
            expect(mockGenerate).toHaveBeenCalledWith(mockTx, expect.objectContaining({ userId }), windowStart, today);
            expect(mockRefreshBalances).toHaveBeenCalledTimes(1);
            expect(result).toEqual({ from: windowStart, to: today, created: 5, trimmed: 7 });
        });

        it("does not reseed when a demo- row exists; the normal top-up runs", async () => {
            mockPrisma.user.findUnique.mockResolvedValue({ demoDataThrough: stored });
            mockPrisma.transaction.findFirst.mockResolvedValue({ id: "t1" });

            await service.topUpIfStale(userId, now);

            expect(mockTx.transaction.deleteMany).toHaveBeenCalledTimes(1);
            expect(mockTx.transaction.deleteMany).toHaveBeenCalledWith({
                where: { userId, transactionDate: { lt: windowStart } },
            });
            expect(mockGenerate).toHaveBeenCalledWith(
                mockTx,
                expect.anything(),
                new Date(Date.UTC(2026, 8, 21)),
                today,
            );
        });

        it("does not reseed a user with no transactions", async () => {
            mockPrisma.user.findUnique.mockResolvedValue({ demoDataThrough: today });
            gate(null, null);

            await service.topUpIfStale(userId, now);

            expect(mockTx.transaction.deleteMany).not.toHaveBeenCalled();
            expect(mockGenerate).not.toHaveBeenCalled();
        });

        it("deletes nothing when the CAS loses the race", async () => {
            mockPrisma.user.findUnique.mockResolvedValue({ demoDataThrough: stored });
            gate(null, { id: "t1" });
            mockTx.user.updateMany.mockResolvedValue({ count: 0 });

            const result = await service.topUpIfStale(userId, now);

            expect(result).toBeNull();
            expect(mockTx.transaction.deleteMany).not.toHaveBeenCalled();
            expect(mockGenerate).not.toHaveBeenCalled();
        });

        it("deletes nothing when the in-transaction re-check finds a demo- row", async () => {
            mockPrisma.user.findUnique.mockResolvedValue({ demoDataThrough: stored });
            gate(null, { id: "t1" });
            mockTx.transaction.findFirst.mockResolvedValue({ id: "t2" });

            const result = await service.topUpIfStale(userId, now);

            expect(result).toBeNull();
            expect(mockTx.transaction.deleteMany).not.toHaveBeenCalled();
            expect(mockGenerate).not.toHaveBeenCalled();
        });
    });
});
