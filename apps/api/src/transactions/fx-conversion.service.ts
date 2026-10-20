import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

const FREE_CURRENCY_API_BASE_URL = "https://api.freecurrencyapi.com/v1/historical";

type ConversionSnapshotInput = {
    transactionId: string;
    sourceCurrencyId: string;
    targetCurrencyId: string;
    amount: number;
    transactionDate: Date;
};

type BackfillMissingSnapshotsOptions = {
    batchSize?: number;
    maxRetries?: number;
    retryDelayMs?: number;
    dryRun?: boolean;
};

type BackfillMissingSnapshotsResult = {
    processedTransactions: number;
    snapshotsAttempted: number;
    snapshotsCreated: number;
    snapshotsFailed: number;
    batchesProcessed: number;
};

@Injectable()
export class FxConversionService {
    private readonly logger = new Logger(FxConversionService.name);

    constructor(private readonly prisma: PrismaService) {}

    private get db(): any {
        return this.prisma as any;
    }

    /**
     * Read-only rate lookup: 1 for same-currency pairs, else the FxRateDaily
     * cache, else a provider fetch (which caches into FxRateDaily). Unlike
     * snapshotTransactionConversion, this never writes TransactionConversion
     * rows. Throws when the rate cannot be resolved (e.g. missing
     * FREE_CURRENCY_API_KEY) — callers decide whether that is fatal.
     */
    async getRate(sourceCurrencyId: string, targetCurrencyId: string, rateDate: Date): Promise<number> {
        if (sourceCurrencyId === targetCurrencyId) {
            return 1;
        }

        const normalizedDate = this.toRateDate(rateDate);
        const cachedRate = await this.db.fxRateDaily.findUnique({
            where: {
                baseCurrencyId_quoteCurrencyId_rateDate: {
                    baseCurrencyId: sourceCurrencyId,
                    quoteCurrencyId: targetCurrencyId,
                    rateDate: normalizedDate,
                },
            },
        });

        if (cachedRate) {
            return Number(cachedRate.rate);
        }

        const rateResult = await this.fetchAndCacheHistoricalRate(sourceCurrencyId, targetCurrencyId, normalizedDate);

        return rateResult.rate;
    }

    async snapshotTransactionConversion(input: ConversionSnapshotInput) {
        if (input.sourceCurrencyId === input.targetCurrencyId) {
            return null;
        }

        const rateDate = this.toRateDate(input.transactionDate);
        const cachedRate = await this.db.fxRateDaily.findUnique({
            where: {
                baseCurrencyId_quoteCurrencyId_rateDate: {
                    baseCurrencyId: input.sourceCurrencyId,
                    quoteCurrencyId: input.targetCurrencyId,
                    rateDate,
                },
            },
        });

        const rateResult = cachedRate
            ? {
                  rate: Number(cachedRate.rate),
                  source: "cache" as const,
                  provider: cachedRate.provider ?? "cache",
                  providerMetadata: cachedRate.providerMetadata,
              }
            : await this.fetchAndCacheHistoricalRate(input.sourceCurrencyId, input.targetCurrencyId, rateDate);

        const convertedAmount = this.roundAmount(input.amount * rateResult.rate);

        await this.db.transactionConversion.upsert({
            where: {
                transactionId_targetCurrencyId: {
                    transactionId: input.transactionId,
                    targetCurrencyId: input.targetCurrencyId,
                },
            },
            create: {
                transactionId: input.transactionId,
                targetCurrencyId: input.targetCurrencyId,
                convertedAmount,
                conversionRate: rateResult.rate,
                rateDate,
                provider: rateResult.provider,
                providerMetadata: {
                    source: rateResult.source,
                    ...(rateResult.providerMetadata ?? {}),
                },
            },
            update: {
                convertedAmount,
                conversionRate: rateResult.rate,
                rateDate,
                provider: rateResult.provider,
                providerMetadata: {
                    source: rateResult.source,
                    ...(rateResult.providerMetadata ?? {}),
                },
            },
        });

        return {
            convertedAmount,
            conversionRate: rateResult.rate,
            rateDate,
            source: rateResult.source,
            provider: rateResult.provider,
        };
    }

    async backfillMissingSnapshots(
        options: BackfillMissingSnapshotsOptions = {},
    ): Promise<BackfillMissingSnapshotsResult> {
        const batchSize = options.batchSize ?? 200;
        const maxRetries = options.maxRetries ?? 3;
        const retryDelayMs = options.retryDelayMs ?? 500;
        const dryRun = options.dryRun ?? false;

        let cursorId: string | undefined;
        let batchesProcessed = 0;
        let processedTransactions = 0;
        let snapshotsAttempted = 0;
        let snapshotsCreated = 0;
        let snapshotsFailed = 0;

        while (true) {
            const transactions = await this.db.transaction.findMany({
                where: {
                    type: "expense",
                    deletedAt: null,
                    ...(cursorId ? { id: { gt: cursorId } } : {}),
                },
                orderBy: { id: "asc" },
                take: batchSize,
                select: {
                    id: true,
                    userId: true,
                    currencyId: true,
                    amount: true,
                    transactionDate: true,
                },
            });

            if (!transactions.length) {
                break;
            }

            batchesProcessed += 1;
            processedTransactions += transactions.length;

            const transactionIds = transactions.map((transaction: any) => transaction.id);
            const userIds = [...new Set(transactions.map((transaction: any) => transaction.userId))];

            const [activeBudgetCurrencies, existingSnapshots] = await Promise.all([
                this.db.budget.findMany({
                    where: {
                        userId: { in: userIds },
                        deletedAt: null,
                        OR: [{ endDate: null }, { endDate: { gte: new Date() } }],
                    },
                    select: { userId: true, currencyId: true },
                    distinct: ["userId", "currencyId"],
                }),
                this.db.transactionConversion.findMany({
                    where: { transactionId: { in: transactionIds } },
                    select: { transactionId: true, targetCurrencyId: true },
                }),
            ]);

            const budgetCurrenciesByUser = new Map<string, Set<string>>();
            for (const row of activeBudgetCurrencies as any[]) {
                if (!budgetCurrenciesByUser.has(row.userId)) {
                    budgetCurrenciesByUser.set(row.userId, new Set());
                }
                budgetCurrenciesByUser.get(row.userId)?.add(row.currencyId);
            }

            const existingSnapshotKeys = new Set(
                (existingSnapshots as any[]).map(
                    ({ transactionId, targetCurrencyId }) => `${transactionId}:${targetCurrencyId}`,
                ),
            );

            for (const transaction of transactions as any[]) {
                const targetCurrencies = budgetCurrenciesByUser.get(transaction.userId);
                if (!targetCurrencies?.size) {
                    continue;
                }

                for (const targetCurrencyId of targetCurrencies) {
                    if (targetCurrencyId === transaction.currencyId) {
                        continue;
                    }

                    const snapshotKey = `${transaction.id}:${targetCurrencyId}`;
                    if (existingSnapshotKeys.has(snapshotKey)) {
                        continue;
                    }

                    snapshotsAttempted += 1;

                    if (dryRun) {
                        continue;
                    }

                    const created = await this.withRetry(
                        () =>
                            this.snapshotTransactionConversion({
                                transactionId: transaction.id,
                                sourceCurrencyId: transaction.currencyId,
                                targetCurrencyId,
                                amount: Number(transaction.amount),
                                transactionDate: transaction.transactionDate,
                            }),
                        maxRetries,
                        retryDelayMs,
                    ).catch((error) => {
                        snapshotsFailed += 1;
                        this.logger.error(
                            `Failed snapshot backfill for transaction ${transaction.id} -> ${targetCurrencyId}: ${String(
                                error,
                            )}`,
                        );
                        return null;
                    });

                    if (created) {
                        snapshotsCreated += 1;
                        existingSnapshotKeys.add(snapshotKey);
                    }
                }
            }

            cursorId = transactions[transactions.length - 1].id;
            this.logger.log(
                `Processed batch ${batchesProcessed} (${transactions.length} transactions, ${snapshotsAttempted} snapshots attempted so far)`,
            );
        }

        return {
            processedTransactions,
            snapshotsAttempted,
            snapshotsCreated,
            snapshotsFailed,
            batchesProcessed,
        };
    }

    private async fetchAndCacheHistoricalRate(sourceCurrencyId: string, targetCurrencyId: string, rateDate: Date) {
        const [sourceCurrency, targetCurrency] = await Promise.all([
            this.db.currency.findUnique({
                where: { id: sourceCurrencyId },
                select: { id: true, code: true },
            }),
            this.db.currency.findUnique({
                where: { id: targetCurrencyId },
                select: { id: true, code: true },
            }),
        ]);

        if (!sourceCurrency || !targetCurrency) {
            throw new Error("Unable to resolve currencies for conversion");
        }

        const apiKey = process.env.FREE_CURRENCY_API_KEY;
        if (!apiKey) {
            throw new Error("FREE_CURRENCY_API_KEY is required to fetch uncached FX rates");
        }

        const dateParam = rateDate.toISOString().slice(0, 10);
        const url = new URL(FREE_CURRENCY_API_BASE_URL);
        url.searchParams.set("apikey", apiKey);
        url.searchParams.set("base_currency", sourceCurrency.code);
        url.searchParams.set("currencies", targetCurrency.code);
        url.searchParams.set("date", dateParam);

        const response = await fetch(url.toString());
        if (!response.ok) {
            throw new Error(`freecurrencyapi request failed (${response.status} ${response.statusText})`);
        }

        const payload = (await response.json()) as {
            data?: Record<string, Record<string, number>>;
            meta?: Record<string, unknown>;
        };
        const rate = payload.data?.[dateParam]?.[targetCurrency.code];

        if (!rate || Number.isNaN(Number(rate))) {
            throw new Error(
                `freecurrencyapi did not return rate for ${sourceCurrency.code}/${targetCurrency.code} at ${dateParam}`,
            );
        }

        const numericRate = Number(rate);

        await this.db.fxRateDaily.upsert({
            where: {
                baseCurrencyId_quoteCurrencyId_rateDate: {
                    baseCurrencyId: sourceCurrencyId,
                    quoteCurrencyId: targetCurrencyId,
                    rateDate,
                },
            },
            create: {
                baseCurrencyId: sourceCurrencyId,
                quoteCurrencyId: targetCurrencyId,
                rateDate,
                rate: numericRate,
                provider: "freecurrencyapi",
                providerMetadata: {
                    source: "provider",
                    date: dateParam,
                    baseCurrency: sourceCurrency.code,
                    quoteCurrency: targetCurrency.code,
                    meta: payload.meta ?? null,
                },
            },
            update: {
                rate: numericRate,
                provider: "freecurrencyapi",
                providerMetadata: {
                    source: "provider",
                    date: dateParam,
                    baseCurrency: sourceCurrency.code,
                    quoteCurrency: targetCurrency.code,
                    meta: payload.meta ?? null,
                },
            },
        });

        this.logger.log(`Cached FX rate ${sourceCurrency.code}/${targetCurrency.code} (${dateParam})`);

        return {
            rate: numericRate,
            source: "provider" as const,
            provider: "freecurrencyapi",
            providerMetadata: {
                date: dateParam,
                baseCurrency: sourceCurrency.code,
                quoteCurrency: targetCurrency.code,
            },
        };
    }

    private toRateDate(value: Date) {
        const normalized = new Date(value);
        normalized.setUTCHours(0, 0, 0, 0);
        return normalized;
    }

    private roundAmount(value: number) {
        return Math.round(value * 1e8) / 1e8;
    }

    private async withRetry<T>(fn: () => Promise<T>, maxRetries: number, retryDelayMs: number): Promise<T> {
        let attempt = 0;
        let lastError: unknown;

        while (attempt <= maxRetries) {
            try {
                return await fn();
            } catch (error) {
                lastError = error;
                if (attempt === maxRetries) {
                    break;
                }

                const delay = retryDelayMs * 2 ** attempt;
                await new Promise((resolve) => setTimeout(resolve, delay));
            }

            attempt += 1;
        }

        throw lastError;
    }
}
