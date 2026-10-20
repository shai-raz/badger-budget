import { Injectable, Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { addDaysUtc, demoAtmDay, demoWindowStart, endOfMonthUtc, toDateOnly } from "./demo-dates";
import {
    CASH_WITHDRAWAL_LABEL,
    DEMO_BANK_ACCOUNT_NAME,
    DEMO_CARD_ACCOUNT_NAME,
    NEEDS_CATEGORIES,
    SALARY_CATEGORY,
    SALARY_DESCRIPTION,
    WANTS_CATEGORIES,
} from "./demo-data.constants";
import {
    DEMO_EXTERNAL_ID_PREFIX,
    DemoDataContext,
    buildDemoAtmWithdrawal,
    generateDemoTransactions,
} from "./demo-data.generator";
import { DemoBalanceAccountIds, ensureDemoBalanceAccounts, refreshDemoBalances } from "./demo-balances";

export interface DemoTopUpResult {
    from: Date;
    to: Date;
    created: number;
    trimmed: number;
}

@Injectable()
export class DemoService {
    private readonly logger = new Logger(DemoService.name);

    constructor(private readonly prisma: PrismaService) {}

    /**
     * Tops up a demo user's transaction history up to `now`'s calendar day, if it's gone stale,
     * and trims anything older than the rolling `DEMO_WINDOW_MONTHS` window. Also refreshes the 5
     * demo balance tiles (see refreshBalances below) — unconditionally, on every call, since those
     * must look current on every login even on a day that adds no new transactions. Returns `null`
     * for the transaction top-up part when there's nothing to do there (already up to date, user
     * not found, or another concurrent call won the race — see the CAS comment below); the balance
     * refresh still runs either way.
     */
    async topUpIfStale(userId: string, now: Date = new Date()): Promise<DemoTopUpResult | null> {
        const today = toDateOnly(now);
        const windowStart = demoWindowStart(today);

        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { demoDataThrough: true },
        });
        if (!user) return null;

        const stored = user.demoDataThrough;

        // One-time reseed gate: demo users seeded before synthetic `demo-` externalIds existed have
        // rows but none of them reads as synced. Not filtering deletedAt on either probe.
        const hasSynced = await this.prisma.transaction.findFirst({
            where: { userId, externalId: { startsWith: DEMO_EXTERNAL_ID_PREFIX } },
            select: { id: true },
        });
        if (!hasSynced) {
            const hasAny = await this.prisma.transaction.findFirst({ where: { userId }, select: { id: true } });
            if (hasAny) {
                const reseeded = await this.reseed(userId, stored, today, windowStart);
                await this.backfillAtmWithdrawals(userId, today, windowStart);
                await this.refreshBalances(userId, now);
                return reseeded;
            }
        }

        const watermark = stored ?? (await this.bootstrapWatermark(userId, windowStart));

        if (watermark.getTime() >= today.getTime()) {
            await this.backfillAtmWithdrawals(userId, today, windowStart);
            await this.refreshBalances(userId, now);
            return null;
        }

        const from =
            addDaysUtc(watermark, 1).getTime() > windowStart.getTime() ? addDaysUtc(watermark, 1) : windowStart;
        const to = today;

        const result = await this.prisma.$transaction(
            async (tx) => {
                // Concurrency guard: only the caller whose `updateMany` actually matches `stored`
                // gets to generate data for this range. A second login racing in for the same
                // user matches nothing (the first call already advanced demoDataThrough), so it
                // gets count === 0 and backs off instead of double-generating. Same idea as
                // AccountsService.upgradeUnknownAccountTypes's conditional updateMany — under
                // READ COMMITTED the loser blocks on the row lock until the winner commits, then
                // re-evaluates the where clause against the now-updated row and still sees 0.
                const { count } = await tx.user.updateMany({
                    where: { id: userId, demoDataThrough: stored },
                    data: { demoDataThrough: today },
                });
                if (count === 0) return null;

                const ctx = await this.loadContext(tx, userId);
                const created = await generateDemoTransactions(tx, ctx, from, to);

                // Hard delete on purpose — a deliberate exception to the app's soft-delete
                // convention. This trims the demo user's rolling window back to
                // DEMO_WINDOW_MONTHS, and a soft delete would leave the old rows behind forever
                // (they're never meant to come back), including any the user themselves
                // soft-deleted. See src/demo/CLAUDE.md.
                const { count: trimmed } = await tx.transaction.deleteMany({
                    where: { userId, transactionDate: { lt: windowStart } },
                });

                const result: DemoTopUpResult = { from, to, created, trimmed };
                this.logger.log(
                    `Topped up demo data for user ${userId}: from=${from.toISOString().slice(0, 10)} ` +
                        `to=${to.toISOString().slice(0, 10)} created=${created} trimmed=${trimmed}`,
                );
                return result;
            },
            { maxWait: 10_000, timeout: 60_000 },
        );

        await this.backfillAtmWithdrawals(userId, today, windowStart);
        await this.refreshBalances(userId, now);

        return result;
    }

    /** Wipes and regenerates the whole rolling window so every bank-style row carries a `demo-` externalId. */
    private async reseed(
        userId: string,
        stored: Date | null,
        today: Date,
        windowStart: Date,
    ): Promise<DemoTopUpResult | null> {
        return this.prisma.$transaction(
            async (tx) => {
                // Same CAS as the normal top-up: a racing login matches nothing and backs off.
                const { count } = await tx.user.updateMany({
                    where: { id: userId, demoDataThrough: stored },
                    data: { demoDataThrough: today },
                });
                if (count === 0) return null;

                // Race guard: another reseed may have committed between the gate and the CAS.
                const synced = await tx.transaction.findFirst({
                    where: { userId, externalId: { startsWith: DEMO_EXTERNAL_ID_PREFIX } },
                    select: { id: true },
                });
                if (synced) return null;

                // Hard delete on purpose — same sanctioned exception to soft-delete as the window
                // trim: demo data is regenerable. See src/demo/CLAUDE.md.
                const { count: deleted } = await tx.transaction.deleteMany({ where: { userId } });

                const ctx = await this.loadContext(tx, userId);
                const created = await generateDemoTransactions(tx, ctx, windowStart, today);

                this.logger.log(
                    `Reseeded demo data for user ${userId}: from=${windowStart.toISOString().slice(0, 10)} ` +
                        `to=${today.toISOString().slice(0, 10)} created=${created} deleted=${deleted}`,
                );
                return { from: windowStart, to: today, created, trimmed: deleted };
            },
            { maxWait: 10_000, timeout: 60_000 },
        );
    }

    /**
     * One-time backfill of the synced card ATM withdrawal for demo users whose window predates it:
     * if no `demo-` row labelled as a cash withdrawal exists, adds this month's and last month's
     * (within the window, never in the future). The probe ignores `deletedAt` on purpose, so one the
     * visitor deleted is not resurrected. Locks the user row first so overlapping logins can't both
     * insert. Own try/catch: errors are logged, never thrown.
     */
    private async backfillAtmWithdrawals(userId: string, today: Date, windowStart: Date): Promise<void> {
        try {
            await this.prisma.$transaction(async (tx) => {
                await tx.user.update({ where: { id: userId }, data: { updatedAt: new Date() } });

                const existing = await tx.transaction.findFirst({
                    where: {
                        userId,
                        additionalDescription: CASH_WITHDRAWAL_LABEL,
                        externalId: { startsWith: DEMO_EXTERNAL_ID_PREFIX },
                    },
                    select: { id: true },
                });
                if (existing) return;

                const ctx = await this.loadContext(tx, userId);
                const year = today.getUTCFullYear();
                const month = today.getUTCMonth();
                const rows = [new Date(Date.UTC(year, month - 1, 1)), new Date(Date.UTC(year, month, 1))]
                    .map(
                        (m) =>
                            new Date(
                                Date.UTC(
                                    m.getUTCFullYear(),
                                    m.getUTCMonth(),
                                    demoAtmDay(m.getUTCFullYear(), m.getUTCMonth()),
                                ),
                            ),
                    )
                    .filter((d) => d.getTime() <= today.getTime() && d.getTime() >= windowStart.getTime())
                    .map((d) => buildDemoAtmWithdrawal(ctx, d, today));
                if (rows.length) await tx.transaction.createMany({ data: rows });
            });
        } catch (error) {
            this.logger.error(
                `Demo ATM withdrawal backfill failed for user ${userId}`,
                error instanceof Error ? error.stack : String(error),
            );
        }
    }

    /**
     * Ensures the 3 new balance-only demo accounts exist and refreshes all 5 demo balance tiles'
     * denormalized balance columns. Its own try/catch (in addition to AuthService's outer one
     * around the whole topUpIfStale call) so a balance-refresh failure can never roll back — or be
     * rolled back by — the separate transaction top-up above; errors are logged, never thrown.
     */
    private async refreshBalances(userId: string, now: Date): Promise<void> {
        try {
            await this.prisma.$transaction(async (tx) => {
                // Per-user serialization: `accounts` has no unique (userId, name), so
                // ensureDemoBalanceAccounts' find-then-create would otherwise let two overlapping
                // logins both create the 3 balance accounts (permanent duplicates). Writing the user
                // row takes a row lock held until commit; a concurrent login blocks here, then its
                // findMany below sees the committed rows. Must stay before any read.
                await tx.user.update({ where: { id: userId }, data: { updatedAt: new Date() } });

                const accounts = await tx.account.findMany({
                    where: { userId, deletedAt: null, name: { in: [DEMO_BANK_ACCOUNT_NAME, DEMO_CARD_ACCOUNT_NAME] } },
                });
                const bank = accounts.find((a) => a.name === DEMO_BANK_ACCOUNT_NAME);
                const card = accounts.find((a) => a.name === DEMO_CARD_ACCOUNT_NAME);
                // No demo accounts yet at all (e.g. a brand new user this call didn't create data
                // for) — nothing to refresh.
                if (!bank || !card) return;

                const currencyId = bank.currencyId ?? card.currencyId;
                if (!currencyId) return;

                const newIds = await ensureDemoBalanceAccounts(tx, userId, currencyId);
                const ids: DemoBalanceAccountIds = { bankAccountId: bank.id, creditCardId: card.id, ...newIds };
                await refreshDemoBalances(tx, userId, ids, now);
            });
        } catch (error) {
            this.logger.error(
                `Demo balance refresh failed for user ${userId}`,
                error instanceof Error ? error.stack : String(error),
            );
        }
    }

    /**
     * A user with no `demoDataThrough` yet (pre-existing demo user, or the watermark column
     * predates them) is bootstrapped from the last salary transaction the original seed created:
     * the seed generated data through the end of that transaction's month, so that's the implied
     * watermark. If no salary transaction exists either, there's no demo data at all yet, so the
     * watermark is set to just before the window start (top-up will generate the whole window).
     */
    private async bootstrapWatermark(userId: string, windowStart: Date): Promise<Date> {
        const lastSalary = await this.prisma.transaction.findFirst({
            where: {
                userId,
                // Not filtering deletedAt: null here — a soft-deleted salary still marks where the
                // original seed left off. The demo login is public, so a visitor can soft-delete the
                // latest salary; if the watermark bootstrap then fell back to an earlier month, top-up
                // would regenerate a month the seed already produced.
                description: SALARY_DESCRIPTION,
                category: { name: SALARY_CATEGORY.name },
            },
            orderBy: { transactionDate: "desc" },
            select: { transactionDate: true },
        });

        return lastSalary ? endOfMonthUtc(lastSalary.transactionDate) : addDaysUtc(windowStart, -1);
    }

    private async loadContext(tx: Prisma.TransactionClient, userId: string): Promise<DemoDataContext> {
        const accounts = await tx.account.findMany({
            where: { userId, deletedAt: null, name: { in: [DEMO_BANK_ACCOUNT_NAME, DEMO_CARD_ACCOUNT_NAME] } },
        });

        const bank = accounts.find((a) => a.name === DEMO_BANK_ACCOUNT_NAME);
        const card = accounts.find((a) => a.name === DEMO_CARD_ACCOUNT_NAME);
        if (!bank || !card) throw new Error("Demo accounts not found");

        const categoryDefs = [...NEEDS_CATEGORIES, ...WANTS_CATEGORIES, SALARY_CATEGORY];
        const categories = await tx.category.findMany({
            where: { userId, deletedAt: null, name: { in: categoryDefs.map((c) => c.name) } },
            select: { id: true, name: true },
        });
        const categoryIds = new Map(categories.map((c) => [c.name, c.id]));

        const currencyId = bank.currencyId ?? (await tx.currency.findUnique({ where: { code: "ILS" } }))?.id;
        if (!currencyId) throw new Error("Demo currency not found");

        return {
            userId,
            currencyId,
            bankAccountId: bank.id,
            creditCardId: card.id,
            categoryIds,
        };
    }
}
