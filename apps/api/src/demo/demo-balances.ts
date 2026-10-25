import { Prisma } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import { faker } from "@faker-js/faker";
import type { BalanceKind, ScrapedAccountType } from "@badger/shared-data";
import {
    DEMO_CAL_CARD_NAME,
    DEMO_CAL_DEBIT_DAY,
    DEMO_NO_LIMIT_CARD_NAME,
    DEMO_SAVINGS_ACCOUNT_NAME,
} from "./demo-data.constants";
import { nextUpcomingDebitDate, startOfMonthUtc } from "./demo-dates";

// Narrowest slice of the Prisma client this module needs — satisfied by PrismaClient,
// PrismaService, and the `tx` handed to a `$transaction` callback alike.
export type DemoBalanceDb = Pick<Prisma.TransactionClient, "account" | "transaction">;

interface NewBalanceAccountDef {
    name: string;
    type: ScrapedAccountType;
    icon: string;
    color: string;
}

// The 3 balance-only accounts this module owns end to end (creates + refreshes). The other 2
// balance tiles are DEMO_BANK_ACCOUNT_NAME and DEMO_CARD_ACCOUNT_NAME, seeded elsewhere with real
// transaction history — refreshDemoBalances below only refreshes their balance columns.
export const NEW_BALANCE_ACCOUNTS: NewBalanceAccountDef[] = [
    { name: DEMO_SAVINGS_ACCOUNT_NAME, type: "bank", icon: "piggy-bank", color: "#0EA5E9" },
    { name: DEMO_CAL_CARD_NAME, type: "credit_card", icon: "credit-card", color: "#F59E0B" },
    { name: DEMO_NO_LIMIT_CARD_NAME, type: "credit_card", icon: "credit-card", color: "#7C3AED" },
];

export interface NewDemoBalanceAccountIds {
    savingsAccountId: string;
    calCardId: string;
    noLimitCardId: string;
}

export interface DemoBalanceAccountIds extends NewDemoBalanceAccountIds {
    bankAccountId: string;
    /** DEMO_CARD_ACCOUNT_NAME, reused as the Isracard-style utilized_credit-with-limit tile. */
    creditCardId: string;
}

/**
 * Creates whichever of the 3 new balance-only demo accounts (savings, Cal card, no-limit card)
 * don't exist yet for this user. Idempotency here is a find-then-create check, not a CAS, and
 * `accounts` has no unique (userId, name) — so the caller MUST serialize per user before calling
 * this (DemoService.refreshBalances writes the user row at the start of its transaction, whose row
 * lock makes a concurrent login wait and then find the committed rows). Without that, two
 * overlapping logins on a user with none of these rows yet would both create them, leaving
 * permanent duplicates. Existing users seeded before this feature go through the exact same path
 * as a brand new demo user, since `findMany` finds nothing for either.
 */
export async function ensureDemoBalanceAccounts(
    db: DemoBalanceDb,
    userId: string,
    currencyId: string,
): Promise<NewDemoBalanceAccountIds> {
    const names = NEW_BALANCE_ACCOUNTS.map((a) => a.name);
    const existing = await db.account.findMany({
        where: { userId, deletedAt: null, name: { in: names } },
        select: { id: true, name: true },
    });
    const idByName = new Map(existing.map((a) => [a.name, a.id]));

    for (const def of NEW_BALANCE_ACCOUNTS) {
        if (idByName.has(def.name)) continue;
        const created = await db.account.create({
            data: { userId, name: def.name, type: def.type, icon: def.icon, color: def.color, currencyId },
            select: { id: true },
        });
        idByName.set(def.name, created.id);
    }

    return {
        savingsAccountId: idByName.get(DEMO_SAVINGS_ACCOUNT_NAME)!,
        calCardId: idByName.get(DEMO_CAL_CARD_NAME)!,
        noLimitCardId: idByName.get(DEMO_NO_LIMIT_CARD_NAME)!,
    };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

async function sumAmount(
    db: DemoBalanceDb,
    userId: string,
    accountId: string,
    type: string,
    transferDirection?: "in" | "out",
): Promise<number> {
    const agg = await db.transaction.aggregate({
        _sum: { amount: true },
        where: { userId, accountId, type, deletedAt: null, ...(transferDirection ? { transferDirection } : {}) },
    });
    return Number(agg._sum.amount ?? 0);
}

/** The bank account's true running balance from its own ledger: income and transfers-in add, expenses and transfers-out subtract. */
async function ledgerBalance(db: DemoBalanceDb, userId: string, accountId: string): Promise<number> {
    const [income, expense, transferOut, transferIn] = await Promise.all([
        sumAmount(db, userId, accountId, "income"),
        sumAmount(db, userId, accountId, "expense"),
        sumAmount(db, userId, accountId, "transfer", "out"),
        sumAmount(db, userId, accountId, "transfer", "in"),
    ]);
    return round2(income - expense - transferOut + transferIn);
}

/** Sum of the card's expense transactions so far in the current calendar month. */
async function currentCycleSpend(
    db: DemoBalanceDb,
    userId: string,
    accountId: string,
    monthStart: Date,
    today: Date,
): Promise<number> {
    const agg = await db.transaction.aggregate({
        _sum: { amount: true },
        where: {
            userId,
            accountId,
            type: "expense",
            deletedAt: null,
            transactionDate: { gte: monthStart, lte: today },
        },
    });
    return round2(Number(agg._sum.amount ?? 0));
}

interface BalanceWrite {
    accountId: string;
    kind: BalanceKind;
    amount: number;
    balanceDate: Date | null;
    cardFrame: number | null;
}

/**
 * Refreshes all 5 demo balance tiles' `accounts.balance`/`balanceKind`/`balanceDate`/`cardFrame`/
 * `balanceUpdatedAt` — the same denormalized columns AccountBalanceService.recordBalances writes
 * for a real scraped balance (see accounts/AGENTS.md), just computed here instead of scraped.
 * Called on every demo login (not gated behind the transaction top-up watermark), so the numbers
 * stay current even on a day that doesn't add any new transactions.
 *
 * Bank/savings are derived from the bank account's own ledger (the only one with real transaction
 * history to derive from); the 3 card tiles are derived from the reused card's real current-cycle
 * spend, scaled by an unseeded random factor so the 3 card balances vary independently rather than
 * moving in lockstep. Unseeded like the rest of top-up generation (see AGENTS.md) — real, if fake,
 * variety on every login, not a frozen snapshot.
 */
export async function refreshDemoBalances(
    db: DemoBalanceDb,
    userId: string,
    ids: DemoBalanceAccountIds,
    now: Date,
): Promise<void> {
    const monthStart = startOfMonthUtc(now);

    const bankBalance = Math.max(await ledgerBalance(db, userId, ids.bankAccountId), 500);

    // No transactions of its own to derive from — a stable-but-varying slice of the real bank
    // ledger balance instead of an unrelated made-up number.
    const savingsBalance = round2(
        Math.min(Math.max(bankBalance * faker.number.float({ min: 0.15, max: 0.35 }), 5000), 80000),
    );

    const cardCycleSpend = await currentCycleSpend(db, userId, ids.creditCardId, monthStart, now);
    const cardUtilized = cardCycleSpend > 0 ? cardCycleSpend : round2(faker.number.float({ min: 300, max: 3000 }));
    const utilizationPct = faker.number.float({ min: 0.2, max: 0.4 });
    // Rounded up to a whole 1,000 so the limit reads like a real card limit and doesn't jump
    // between logins by a few shekels.
    const cardFrame = Math.ceil(cardUtilized / utilizationPct / 1000) * 1000;

    // Neither has transaction history of its own either — scaled off the same real card-spend
    // signal so all 3 cards move together with the demo's actual card activity.
    const calCharge = round2(
        cardCycleSpend > 0
            ? cardCycleSpend * faker.number.float({ min: 0.5, max: 1.5 })
            : faker.number.float({ min: 800, max: 4500 }),
    );
    const noLimitUtilized = round2(
        cardCycleSpend > 0
            ? cardCycleSpend * faker.number.float({ min: 0.3, max: 1.2 })
            : faker.number.float({ min: 200, max: 4000 }),
    );

    // `amount` is negative for next_charge/utilized_credit — see the BalanceKind storage
    // convention (BALANCE_KIND_BY_COMPANY / getBalanceDisplay in the web app).
    const writes: BalanceWrite[] = [
        {
            accountId: ids.bankAccountId,
            kind: "account_balance",
            amount: bankBalance,
            balanceDate: null,
            cardFrame: null,
        },
        {
            accountId: ids.savingsAccountId,
            kind: "account_balance",
            amount: savingsBalance,
            balanceDate: null,
            cardFrame: null,
        },
        {
            accountId: ids.creditCardId,
            kind: "utilized_credit",
            amount: -cardUtilized,
            balanceDate: null,
            cardFrame,
        },
        {
            accountId: ids.calCardId,
            kind: "next_charge",
            amount: -calCharge,
            balanceDate: nextUpcomingDebitDate(now, DEMO_CAL_DEBIT_DAY),
            cardFrame: null,
        },
        {
            accountId: ids.noLimitCardId,
            kind: "utilized_credit",
            amount: -noLimitUtilized,
            balanceDate: null,
            cardFrame: null,
        },
    ];

    for (const write of writes) {
        await db.account.update({
            where: { id: write.accountId },
            data: {
                balance: new Decimal(write.amount),
                balanceKind: write.kind,
                balanceDate: write.balanceDate,
                balanceUpdatedAt: now,
                cardFrame: write.cardFrame === null ? null : new Decimal(write.cardFrame),
            },
        });
    }
}
