import { BadRequestException, Injectable } from "@nestjs/common";
import type { MonthlySpending, SpendingReport, SpendingReportCategoryItem } from "@badger/types";
import { DEFAULT_CURRENCY_CODE, UNCATEGORIZED_CATEGORY } from "@badger/shared-data";
import { toIsoDateString } from "@badger/utils";
import { PrismaService } from "../prisma/prisma.service";
import { FxConversionService } from "../transactions/fx-conversion.service";
import { ACTIVE_SIDE, netOf, sumAllocations } from "../transactions/reimbursement-netting";
import { mapWithConcurrency } from "../bank-sync/concurrency.util";
import { SpendingReportQueryDto } from "./dto/spending-report-query.dto";
import { MonthlySpendingQueryDto } from "./dto/monthly-spending-query.dto";
import { getPreviousPeriod, getYearOverYearPeriod } from "./utils/report-period.util";

/** Max simultaneous provider fetches when FxRateDaily misses need filling. */
const FX_FETCH_CONCURRENCY = 5;

/** Max months in one monthly-spending request. */
const MAX_MONTHLY_SPAN = 60;

interface SpendingWindow {
    total: number;
    transactionCount: number;
    categories: SpendingReportCategoryItem[];
}

interface CategoryBucket {
    categoryId: string | null;
    name: string;
    color: string;
    icon: string | null;
    amount: number;
    transactionCount: number;
}

interface ExpenseRow {
    amount: unknown;
    currencyId: string;
    transactionDate: Date;
    categoryId: string | null;
    category: {
        id: string;
        name: string;
        color: string;
        icon: string | null;
    } | null;
    reimbursedBy: { amount: unknown }[];
}

@Injectable()
export class ReportsService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly fxConversion: FxConversionService,
    ) {}

    /**
     * Total spending, per-category breakdown, and a comparison against the
     * period chosen by `query.compare` (previous period by default), all
     * converted to the requested display currency. Unlike the budget path (which reads pre-materialized
     * `TransactionConversion` snapshots and treats missing ones as 0), an
     * unresolvable FX rate here fails the request — the headline total must not
     * silently drop transactions.
     */
    async getSpendingReport(userId: string, query: SpendingReportQueryDto): Promise<SpendingReport> {
        const start = new Date(query.startDate);
        const end = new Date(query.endDate);

        if (end < start) {
            throw new BadRequestException("endDate must not be before startDate");
        }

        const currency = await this.resolveCurrency(query.currency);

        const previousPeriod =
            query.compare === "yearOverYear" ? getYearOverYearPeriod(start, end) : getPreviousPeriod(start, end);

        const [currentTransactions, previousTransactions] = await Promise.all([
            this.findExpenses(userId, start, end),
            this.findExpenses(userId, previousPeriod.start, previousPeriod.end),
        ]);

        // All rates for both windows are resolved up front (cached rates in one
        // query, provider misses with bounded concurrency), so aggregation below
        // is synchronous and each unique (currency, date) pair is fetched once.
        const rates = await this.resolveRates([...currentTransactions, ...previousTransactions], currency.id);

        const current = this.aggregateWindow(currentTransactions, currency.id, rates);
        const previous = this.aggregateWindow(previousTransactions, currency.id, rates);

        const changePercentage =
            previous.total > 0 ? roundTo1(((current.total - previous.total) / previous.total) * 100) : null;

        const direction =
            changePercentage === null || changePercentage === 0 ? "flat" : changePercentage > 0 ? "up" : "down";

        return {
            startDate: query.startDate,
            endDate: query.endDate,
            currency: { code: currency.code, symbol: currency.symbol },
            total: current.total,
            transactionCount: current.transactionCount,
            comparison: {
                startDate: toIsoDateString(previousPeriod.start),
                endDate: toIsoDateString(previousPeriod.end),
                total: previous.total,
                changePercentage,
                direction,
            },
            categories: current.categories,
        };
    }

    /**
     * Expense totals for each calendar month in [startMonth, endMonth], in the
     * display currency, with the same filters and FX rules as getSpendingReport.
     * `firstMonth` is the earliest month with any counted expense, so the client
     * knows how far back the month strip can scroll.
     */
    async getMonthlySpending(userId: string, query: MonthlySpendingQueryDto): Promise<MonthlySpending> {
        const { startMonth, endMonth } = query;

        if (endMonth < startMonth) {
            throw new BadRequestException("endMonth must not be before startMonth");
        }

        if (monthSpan(startMonth, endMonth) > MAX_MONTHLY_SPAN) {
            throw new BadRequestException(`A monthly spending range must not exceed ${MAX_MONTHLY_SPAN} months`);
        }

        const currency = await this.resolveCurrency(query.currency);

        const start = new Date(`${startMonth}-01`);
        const [endYear, endNum] = endMonth.split("-").map(Number);
        // Day 0 of the following month = last day of endMonth.
        const end = new Date(Date.UTC(endYear, endNum, 0));

        const [rows, firstExpense] = await Promise.all([
            this.findExpenses(userId, start, end),
            this.prisma.transaction.findFirst({
                where: this.expenseWhere(userId),
                orderBy: { transactionDate: "asc" },
                select: { transactionDate: true },
            }),
        ]);

        const rates = await this.resolveRates(rows, currency.id);

        const buckets = new Map<string, { amount: number; transactionCount: number }>();
        for (const txn of rows) {
            const month = toIsoDateString(txn.transactionDate).slice(0, 7);
            let bucket = buckets.get(month);
            if (!bucket) {
                bucket = { amount: 0, transactionCount: 0 };
                buckets.set(month, bucket);
            }
            bucket.amount += this.convert(txn, currency.id, rates);
            bucket.transactionCount += 1;
        }

        const months = listMonths(startMonth, endMonth).map((month) => {
            const bucket = buckets.get(month);
            return {
                month,
                total: roundTo2(bucket?.amount ?? 0),
                transactionCount: bucket?.transactionCount ?? 0,
            };
        });

        return {
            startMonth,
            endMonth,
            currency: { code: currency.code, symbol: currency.symbol },
            months,
            firstMonth: firstExpense ? toIsoDateString(firstExpense.transactionDate).slice(0, 7) : null,
        };
    }

    private async resolveCurrency(code?: string) {
        const currencyCode = code ?? DEFAULT_CURRENCY_CODE;
        const currency = await this.prisma.currency.findUnique({
            where: { code: currencyCode },
        });

        if (!currency) {
            throw new BadRequestException(`Unknown currency code: ${currencyCode}`);
        }

        return currency;
    }

    /** The filters every spending figure shares: the user's visible, live expenses. */
    private expenseWhere(userId: string) {
        return { userId, deletedAt: null, hidden: false, type: "expense" as const };
    }

    private findExpenses(userId: string, start: Date, end: Date): Promise<ExpenseRow[]> {
        return this.prisma.transaction.findMany({
            where: {
                ...this.expenseWhere(userId),
                transactionDate: {
                    gte: start,
                    lte: end,
                },
            },
            select: {
                amount: true,
                currencyId: true,
                transactionDate: true,
                categoryId: true,
                category: {
                    select: { id: true, name: true, color: true, icon: true },
                },
                reimbursedBy: { where: { income: ACTIVE_SIDE }, select: { amount: true } },
            },
        });
    }

    /**
     * Resolves every FX rate the given transactions need, keyed by
     * `currencyId:YYYY-MM-DD`. Cached rates are preloaded with a single
     * `FxRateDaily` query; only the misses hit the provider, at most
     * FX_FETCH_CONCURRENCY at a time. Any unresolvable rate fails the report.
     */
    private async resolveRates(transactions: ExpenseRow[], targetCurrencyId: string): Promise<Map<string, number>> {
        const pending = new Map<string, { currencyId: string; rateDate: Date }>();
        for (const txn of transactions) {
            if (txn.currencyId === targetCurrencyId) {
                continue;
            }
            const rateDate = toRateDate(txn.transactionDate);
            const key = rateKey(txn.currencyId, rateDate);
            if (!pending.has(key)) {
                pending.set(key, { currencyId: txn.currencyId, rateDate });
            }
        }

        const rates = new Map<string, number>();
        if (pending.size === 0) {
            return rates;
        }

        const cachedRates = await this.prisma.fxRateDaily.findMany({
            where: {
                quoteCurrencyId: targetCurrencyId,
                OR: [...pending.values()].map(({ currencyId, rateDate }) => ({
                    baseCurrencyId: currencyId,
                    rateDate,
                })),
            },
            select: { baseCurrencyId: true, rateDate: true, rate: true },
        });
        for (const cached of cachedRates) {
            rates.set(rateKey(cached.baseCurrencyId, cached.rateDate), Number(cached.rate));
        }

        const misses = [...pending.entries()].filter(([key]) => !rates.has(key));
        const fetched = await mapWithConcurrency(misses, FX_FETCH_CONCURRENCY, ([, { currencyId, rateDate }]) =>
            this.fxConversion.getRate(currencyId, targetCurrencyId, rateDate),
        );
        for (const result of fetched) {
            if (result.ok === false) {
                throw result.error;
            }
            rates.set(result.item[0], result.value);
        }

        return rates;
    }

    private aggregateWindow(
        transactions: ExpenseRow[],
        targetCurrencyId: string,
        rates: Map<string, number>,
    ): SpendingWindow {
        const buckets = new Map<string, CategoryBucket>();

        for (const txn of transactions) {
            const converted = this.convert(txn, targetCurrencyId, rates);

            const bucketKey = txn.categoryId ?? "__uncategorized__";
            let bucket = buckets.get(bucketKey);
            if (!bucket) {
                bucket = {
                    categoryId: txn.categoryId,
                    name: txn.category?.name ?? UNCATEGORIZED_CATEGORY.name,
                    color: txn.category?.color ?? UNCATEGORIZED_CATEGORY.color,
                    icon: txn.category?.icon ?? null,
                    amount: 0,
                    transactionCount: 0,
                };
                buckets.set(bucketKey, bucket);
            }

            bucket.amount += converted;
            bucket.transactionCount += 1;
        }

        const total = [...buckets.values()].reduce((sum, bucket) => sum + bucket.amount, 0);

        const categories = [...buckets.values()]
            .sort((a, b) => b.amount - a.amount)
            .map((bucket) => ({
                categoryId: bucket.categoryId,
                name: bucket.name,
                color: bucket.color,
                icon: bucket.icon,
                amount: roundTo2(bucket.amount),
                percentage: total > 0 ? roundTo1((bucket.amount / total) * 100) : 0,
                transactionCount: bucket.transactionCount,
            }));

        return {
            total: roundTo2(total),
            transactionCount: transactions.length,
            categories,
        };
    }

    /** One expense in the target currency, net of active income reimbursements. */
    private convert(txn: ExpenseRow, targetCurrencyId: string, rates: Map<string, number>): number {
        const rate =
            txn.currencyId === targetCurrencyId
                ? 1
                : rates.get(rateKey(txn.currencyId, toRateDate(txn.transactionDate)));
        if (rate === undefined) {
            // resolveRates covered every pair; this is a programming error.
            throw new Error(`Missing FX rate for ${txn.currencyId} on ${toIsoDateString(txn.transactionDate)}`);
        }
        return netOf(txn.amount, sumAllocations(txn.reimbursedBy)) * rate;
    }
}

/** Calendar months from startMonth through endMonth (YYYY-MM), inclusive. */
function monthSpan(startMonth: string, endMonth: string): number {
    const [startYear, startNum] = startMonth.split("-").map(Number);
    const [endYear, endNum] = endMonth.split("-").map(Number);
    return (endYear - startYear) * 12 + (endNum - startNum) + 1;
}

/** Every YYYY-MM from startMonth through endMonth, ascending. */
function listMonths(startMonth: string, endMonth: string): string[] {
    const months: string[] = [];
    const cursor = new Date(`${startMonth}-01`);
    const last = new Date(`${endMonth}-01`);
    while (cursor <= last) {
        months.push(toIsoDateString(cursor).slice(0, 7));
        cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }
    return months;
}

function rateKey(currencyId: string, rateDate: Date): string {
    return `${currencyId}:${toIsoDateString(rateDate)}`;
}

/** Normalizes to UTC midnight, matching how FxRateDaily keys its rows. */
function toRateDate(value: Date): Date {
    const normalized = new Date(value);
    normalized.setUTCHours(0, 0, 0, 0);
    return normalized;
}

function roundTo2(value: number): number {
    return Math.round(value * 100) / 100;
}

function roundTo1(value: number): number {
    return Math.round(value * 10) / 10;
}
