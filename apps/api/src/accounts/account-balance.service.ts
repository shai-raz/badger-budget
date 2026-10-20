import { Injectable, Logger } from "@nestjs/common";
import { Decimal } from "@prisma/client/runtime/library";
import type { BalanceKind } from "@badger/shared-data";
import { PrismaService } from "../prisma/prisma.service";
import { resolveDefaultAccountCurrencyId } from "./default-account-currency";

export interface RecordableBalance {
    accountNumber: string;
    amount: number;
    balanceDate: Date | null;
    isSavings: boolean;
    /** The card's credit limit, or null. Not summable across accounts — Cal's frame is group-level. */
    cardFrame: number | null;
    cardIssuer: "bankIssued" | "companyIssued" | null;
}

export interface RecordBalancesOptions {
    balances: RecordableBalance[];
    /** From the provider's `balanceKind`. `null` means we can't interpret the number — skip it. */
    kind: BalanceKind | null;
    scraperJobId?: string;
    defaultCurrencyCode?: string;
}

@Injectable()
export class AccountBalanceService {
    private readonly logger = new Logger(AccountBalanceService.name);

    constructor(private readonly prisma: PrismaService) {}

    /**
     * Appends a balance snapshot per account and refreshes the denormalized latest balance.
     *
     * Creates the `Account` row when it doesn't exist yet — that's what makes balance-only
     * accounts (Leumi savings deposits arrive with `txns: []`) visible at all, since the
     * transaction import path only ever creates accounts for numbers seen on a transaction.
     *
     * @returns how many balances were recorded and how many accounts were created in the process.
     */
    async recordBalances(
        userId: string,
        options: RecordBalancesOptions,
    ): Promise<{ recorded: number; accountsCreated: number }> {
        const { balances, kind, scraperJobId, defaultCurrencyCode } = options;

        if (balances.length === 0) return { recorded: 0, accountsCreated: 0 };

        if (kind === null) {
            this.logger.warn(
                `Skipping ${balances.length} balance(s) for user ${userId}: provider has no known balance semantics`,
            );
            return { recorded: 0, accountsCreated: 0 };
        }

        // Resolved lazily and reused — only needed when we actually have to create an account.
        let fallbackCurrencyId: string | null = null;
        const resolveFallbackCurrencyId = async (): Promise<string> => {
            fallbackCurrencyId ??= await resolveDefaultAccountCurrencyId(this.prisma, userId, defaultCurrencyCode);
            return fallbackCurrencyId;
        };

        const scrapedAt = new Date();
        let recorded = 0;
        let accountsCreated = 0;
        let failed = 0;

        for (const balance of balances) {
            try {
                // Look up regardless of deletedAt: a soft-deleted account is a deliberate removal,
                // not an absence, and must not be resurrected by falling through to account.create
                // below. If a live and a deleted row somehow share the number, the live one wins.
                const candidates = await this.prisma.account.findMany({
                    where: { userId, accountNumber: balance.accountNumber },
                    select: { id: true, currencyId: true, deletedAt: true },
                });
                const existing = candidates.find((a) => a.deletedAt === null) ?? candidates[0] ?? null;

                if (existing?.deletedAt) {
                    this.logger.debug(
                        `Skipping balance for account ${balance.accountNumber} (user ${userId}): account is soft-deleted`,
                    );
                    continue;
                }

                const amount = new Decimal(balance.amount);
                const cardFrame = balance.cardFrame === null ? null : new Decimal(balance.cardFrame);

                // Resolved before the transaction: resolveFallbackCurrencyId only reads (and
                // memoizes across iterations of this loop), so it has no business inside the
                // atomic unit below.
                let currencyId: string;
                // Only set when the existing account has no currency of its own, so the update
                // below can pin the resolved fallback onto it (see comment near that update).
                let currencyIdToPin: string | null = null;
                if (existing) {
                    currencyId = existing.currencyId ?? (await resolveFallbackCurrencyId());
                    if (!existing.currencyId) currencyIdToPin = currencyId;
                } else {
                    currencyId = await resolveFallbackCurrencyId();
                }

                // Set inside the transaction, acted on only once it commits: the create below is
                // rolled back if the snapshot insert fails, so counting or logging it in there
                // would report an account that doesn't exist.
                let createdAccount = false;

                await this.prisma.$transaction(async (tx) => {
                    let accountId: string;

                    if (existing) {
                        accountId = existing.id;
                    } else {
                        // Mirrors the auto-creation in transaction-import.service.ts: the account number
                        // doubles as the display name until the user renames it.
                        const created = await tx.account.create({
                            data: {
                                userId,
                                name: balance.accountNumber,
                                accountNumber: balance.accountNumber,
                                type: "unknown",
                                currencyId,
                                color:
                                    "#" +
                                    Math.floor(Math.random() * 16777215)
                                        .toString(16)
                                        .padStart(6, "0"),
                            },
                            select: { id: true },
                        });
                        accountId = created.id;
                        createdAccount = true;
                    }

                    await tx.accountBalanceSnapshot.create({
                        data: {
                            userId,
                            accountId,
                            scraperJobId: scraperJobId ?? null,
                            amount,
                            currencyId,
                            kind,
                            balanceDate: balance.balanceDate,
                            cardFrame,
                            cardIssuer: balance.cardIssuer,
                            scrapedAt,
                        },
                    });

                    await tx.account.update({
                        where: { id: accountId },
                        data: {
                            balance: amount,
                            balanceKind: kind,
                            balanceDate: balance.balanceDate,
                            balanceUpdatedAt: scrapedAt,
                            // Written unconditionally, nulls included: the *latest observation*, like
                            // balanceDate above — the snapshot table keeps history either way. That only
                            // covers a provider that still reports the card but drops the frame: a
                            // cancelled card vanishes from `result.accounts` entirely, so `cardFrame` goes
                            // stale indefinitely (same shape `balance` already has). Closing that gap
                            // needs staleness keyed off `balanceUpdatedAt` vs. the connection's last sync.
                            cardFrame,
                            cardIssuer: balance.cardIssuer,
                            // Pin the resolved currency onto the account so it stops being implicit.
                            // Without this, an account with no currency re-derives the fallback from
                            // the user's transaction mix on every sync, which can silently change the
                            // unit of accounts.balance from one sync to the next.
                            ...(currencyIdToPin ? { currencyId: currencyIdToPin } : {}),
                        },
                    });
                });

                if (createdAccount) {
                    accountsCreated++;
                    this.logger.log(
                        `Created account ${balance.accountNumber} from a balance-only scraped account${balance.isSavings ? " (savings)" : ""}`,
                    );
                }

                recorded++;
            } catch (error) {
                failed++;
                const message = error instanceof Error ? error.message : String(error);
                this.logger.warn(`Failed to record balance for account ${balance.accountNumber}: ${message}`);
            }
        }

        if (failed > 0) {
            this.logger.warn(`Failed to record ${failed} of ${balances.length} balance(s) for user ${userId}`);
        }

        return { recorded, accountsCreated };
    }
}
