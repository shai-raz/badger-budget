import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { CardPayoffPatternsService } from "../card-payoff-patterns/card-payoff-patterns.service";
import { CreateTransactionDto } from "./dto/create-transaction.dto";
import { CreateTransactionAttachmentDto } from "./dto/create-transaction-attachment.dto";
import { UpdateTransactionDto } from "./dto/update-transaction.dto";
import { TransactionResponseDto } from "./dto/transaction-response.dto";
import { TransactionAttachmentResponseDto } from "./dto/transaction-attachment-response.dto";
import { PaginatedTransactionsResponseDto } from "./dto/transaction-list-response.dto";
import { TransactionsSummaryResponseDto } from "./dto/transactions-summary-response.dto";
import { assertSyncedEditAllowed, LOCKED_FIELDS, SyncedLockSnapshot } from "./synced-edit-lock";
import {
    assertMirrorDeleteAllowed,
    assertMirrorEditAllowed,
    reconcileCounterpart,
    ExistingMirror,
} from "./transfer-counterpart";
import { FxConversionService } from "./fx-conversion.service";
import { toAccountResponse } from "../accounts/account-response.mapper";
import {
    ACTIVE_SIDE,
    fromCents,
    netOf,
    sumAllocations,
    toCents,
    toReimbursementSummary,
} from "./reimbursement-netting";
import { assertReimbursementEditAllowed } from "./reimbursement-edit-guard";
import { lockReimbursements } from "./reimbursement-lock";

/** Filters accepted by the transaction list endpoint (superset of legacy params). */
export interface ListTransactionsFilters {
    // Pagination — when `page` is set the caller wants the paginated shape.
    page?: number;
    limit?: number;
    // New filters
    search?: string;
    categoryIds?: string[];
    includeHidden?: boolean;
    sortBy?: "transactionDate" | "amount" | "description" | "createdAt";
    sortOrder?: "asc" | "desc";
    // Legacy filters
    accountId?: string;
    categoryId?: string;
    budgetId?: string;
    type?: string;
    startDate?: string;
    endDate?: string;
}

/**
 * Filters accepted by the summary endpoint — the list filters minus
 * pagination/sort/includeHidden (totals ignore paging/order and always exclude
 * hidden).
 */
export type SummaryTransactionsFilters = Omit<
    ListTransactionsFilters,
    "page" | "limit" | "sortBy" | "sortOrder" | "includeHidden"
>;

/** Lean, relation-flattened transaction row (no attachments / nested objects). */
export interface TransactionLeanRow {
    id: string;
    transactionDate: Date;
    postedDate: Date | null;
    type: string;
    transferDirection: string | null;
    amount: number;
    /** `amount` net of active reimbursement links (expense: minus reimbursed; income: unallocated part). */
    netAmount: number;
    currencyCode: string;
    originalAmount: number | null;
    originalCurrencyCode: string | null;
    description: string;
    additionalDescription: string | null;
    notes: string | null;
    hidden: boolean;
    paymentType: string | null;
    originalCategory: string | null;
    categoryId: string | null;
    categoryName: string | null;
    accountId: string;
    accountName: string;
    budgetId: string | null;
    budgetName: string | null;
}

interface AggregateGroupRow {
    transactionDate?: Date;
    type: string;
    transferDirection: string | null;
    currencyId: string;
    _sum?: { amount?: unknown };
    _count?: { _all?: number };
}

export type TransactionAggregateGroupBy = "month" | "category" | "merchant" | "account";

export type TransactionAggregateFilters = Omit<ListTransactionsFilters, "page" | "limit" | "sortBy" | "sortOrder">;

export interface TransactionAggregateRow {
    key: string | null;
    label: string;
    type: string;
    transferDirection: string | null;
    currencyCode: string;
    sum: number;
    count: number;
}

const AGGREGATE_FIELD: Record<TransactionAggregateGroupBy, string> = {
    month: "transactionDate",
    category: "categoryId",
    merchant: "description",
    account: "accountId",
};

/** The fields `aggregate` reads from the expense or income side of a reimbursement link to key its netting. */
const NET_SIDE_SELECT = {
    type: true,
    transferDirection: true,
    currencyId: true,
    transactionDate: true,
    categoryId: true,
    description: true,
    accountId: true,
} as const;

const DEFAULT_PAGE_SIZE = 50;
const CATEGORY_UNCATEGORIZED = "uncategorized";

const transactionInclude = {
    account: { include: { currency: true } },
    currency: true,
    originalCurrency: true,
    category: true,
    budget: true,
    attachments: { where: { deletedAt: null }, orderBy: { createdAt: "asc" } },
    counterpart: {
        select: {
            id: true,
            accountId: true,
            amount: true,
            currencyId: true,
            account: { select: { name: true } },
        },
    },
    counterpartOf: {
        select: { id: true, description: true, accountId: true, account: { select: { name: true } } },
    },
    reimbursedBy: {
        where: { income: { deletedAt: null } },
        select: {
            id: true,
            amount: true,
            income: {
                select: {
                    id: true,
                    description: true,
                    amount: true,
                    transactionDate: true,
                    hidden: true,
                    deletedAt: true,
                    reimburses: { select: { amount: true } },
                },
            },
        },
    },
    reimburses: {
        where: { expense: { deletedAt: null } },
        select: {
            id: true,
            amount: true,
            expense: {
                select: {
                    id: true,
                    description: true,
                    amount: true,
                    transactionDate: true,
                    hidden: true,
                    deletedAt: true,
                    reimbursedBy: { select: { amount: true } },
                },
            },
        },
    },
} satisfies Prisma.TransactionInclude;

type TransactionRow = Prisma.TransactionGetPayload<{ include: typeof transactionInclude }>;

@Injectable()
export class TransactionsService {
    constructor(
        private prisma: PrismaService,
        private cardPayoffPatternsService: CardPayoffPatternsService,
        private fxConversionService: FxConversionService,
    ) {}

    private get db(): any {
        return this.prisma as any;
    }

    private readonly transactionInclude = transactionInclude;

    /**
     * Runs the nested `account` relation through `toAccountResponse` so its
     * `balance`/`cardFrame` Decimals come out as numbers, matching
     * `ITransactionResponse.account`'s declared type. `transactionInclude`
     * always loads `account.currency`, so the cast here is safe.
     */
    private toTransactionResponse(row: TransactionRow): TransactionResponseDto {
        const { counterpart, counterpartOf, reimbursedBy, reimburses, ...rest } = row;
        return {
            ...rest,
            account: toAccountResponse(row.account),
            counterpartOfId: row.counterpartOfId,
            reimbursement: toReimbursementSummary({ ...row, reimbursedBy, reimburses }),
            counterpart: counterpart
                ? {
                      id: counterpart.id,
                      accountId: counterpart.accountId,
                      accountName: counterpart.account.name,
                      amount: Number(counterpart.amount),
                      currencyId: counterpart.currencyId,
                  }
                : null,
            counterpartOf: counterpartOf
                ? {
                      id: counterpartOf.id,
                      description: counterpartOf.description,
                      accountId: counterpartOf.accountId,
                      accountName: counterpartOf.account.name,
                  }
                : null,
        } as unknown as TransactionResponseDto;
    }

    async create(userId: string, createTransactionDto: CreateTransactionDto): Promise<TransactionResponseDto> {
        const { counterpartAccountId, counterpartAmount, ...rest } = createTransactionDto;
        if ((counterpartAccountId || counterpartAmount !== undefined) && createTransactionDto.type !== "transfer") {
            throw new BadRequestException("Only transfers can have a counterpart account");
        }
        const createdRow: TransactionRow = await this.prisma.$transaction(async (tx) => {
            await this.assertAccountCurrency(
                tx,
                userId,
                createTransactionDto.accountId,
                createTransactionDto.currencyId,
            );
            const created = await tx.transaction.create({
                data: {
                    ...rest,
                    userId,
                    transactionDate: new Date(createTransactionDto.transactionDate),
                    postedDate: createTransactionDto.postedDate ? new Date(createTransactionDto.postedDate) : null,
                } as Prisma.TransactionUncheckedCreateInput,
            });
            if (counterpartAccountId) {
                await reconcileCounterpart(tx, created, null, { counterpartAccountId, counterpartAmount });
            }
            return tx.transaction.findUniqueOrThrow({ where: { id: created.id }, include: transactionInclude });
        });
        const createdTransaction = this.toTransactionResponse(createdRow);

        await this.snapshotBudgetConversions(userId, createdTransaction);

        return createdTransaction;
    }

    /**
     * Builds the Prisma `where` clause shared by the list endpoint's legacy and
     * paginated branches. For legacy callers (who send only the legacy params)
     * this produces the exact same clause as before — the new filters only add
     * keys when their params are present.
     */
    private buildListWhere(userId: string, filters?: ListTransactionsFilters): any {
        const where: any = {
            userId,
            deletedAt: null,
        };

        if (!filters) {
            return where;
        }

        // Legacy equality filters
        if (filters.accountId) where.accountId = filters.accountId;
        if (filters.categoryId) where.categoryId = filters.categoryId;
        if (filters.budgetId) where.budgetId = filters.budgetId;
        if (filters.type) where.type = filters.type;

        // Inclusive transactionDate range
        if (filters.startDate || filters.endDate) {
            where.transactionDate = {};
            if (filters.startDate) {
                where.transactionDate.gte = new Date(filters.startDate);
            }
            if (filters.endDate) {
                where.transactionDate.lte = new Date(filters.endDate);
            }
        }

        // Hidden only filters when explicitly false; absent/true keeps legacy
        // behavior of showing everything.
        if (filters.includeHidden === false) {
            where.hidden = false;
        }

        // categoryIds and search each contribute an OR group; when both are
        // present they combine under AND so neither clobbers the other. When
        // neither is present, no AND/OR keys are added (byte-identical legacy).
        const andConditions: any[] = [];

        if (filters.categoryIds && filters.categoryIds.length > 0) {
            const realIds = filters.categoryIds.filter((id) => id !== CATEGORY_UNCATEGORIZED);
            const hasUncategorized = filters.categoryIds.includes(CATEGORY_UNCATEGORIZED);
            const categoryOr: any[] = [];
            if (realIds.length > 0) {
                categoryOr.push({ categoryId: { in: realIds } });
            }
            if (hasUncategorized) {
                categoryOr.push({ categoryId: null });
            }
            if (categoryOr.length > 0) {
                andConditions.push({ OR: categoryOr });
            }
        }

        if (filters.search) {
            andConditions.push({
                OR: [
                    { description: { contains: filters.search, mode: "insensitive" } },
                    { additionalDescription: { contains: filters.search, mode: "insensitive" } },
                    { category: { name: { contains: filters.search, mode: "insensitive" } } },
                ],
            });
        }

        if (andConditions.length > 0) {
            where.AND = andConditions;
        }

        return where;
    }

    async findAll(
        userId: string,
        filters?: ListTransactionsFilters,
    ): Promise<TransactionResponseDto[] | PaginatedTransactionsResponseDto> {
        // Paginated branch: switched on by the presence of `page`.
        if (filters?.page !== undefined) {
            return this.findPaginated(userId, filters);
        }

        // Legacy branch: exact same query as before (unpaginated array).
        const where = this.buildListWhere(userId, filters);

        const rows = await this.db.transaction.findMany({
            where,
            include: this.transactionInclude,
            orderBy: { transactionDate: "desc" },
        });

        return rows.map((row) => this.toTransactionResponse(row));
    }

    private async findPaginated(
        userId: string,
        filters: ListTransactionsFilters,
    ): Promise<PaginatedTransactionsResponseDto> {
        const page = filters.page ?? 1;
        const limit = filters.limit ?? DEFAULT_PAGE_SIZE;
        const sortBy = filters.sortBy ?? "transactionDate";
        const sortOrder = filters.sortOrder ?? "desc";

        const where = this.buildListWhere(userId, filters);

        const [rows, total]: [TransactionRow[], number] = await this.db.$transaction([
            this.db.transaction.findMany({
                where,
                include: this.transactionInclude,
                // { id: "desc" } tiebreaker is required: transactionDate is
                // date-only with heavy ties, so offset pages would otherwise
                // repeat/skip rows.
                orderBy: [{ [sortBy]: sortOrder }, { id: "desc" }],
                skip: (page - 1) * limit,
                take: limit,
            }),
            this.db.transaction.count({ where }),
        ]);

        return {
            data: rows.map((row) => this.toTransactionResponse(row)),
            total,
            page,
            pageSize: limit,
            totalPages: Math.ceil(total / limit),
        };
    }

    /**
     * Aggregate totals for the transaction list matching `filters`.
     *
     * Hidden transactions are ALWAYS excluded (forced `hidden: false`) — the
     * list's "show hidden" toggle never affects totals (product decision).
     *
     * Metrics are naive single-currency sums with NO FX conversion, exactly
     * like the web client's `Total.vue`. `currencyCode` is a best-effort display
     * hint from the most recent matching transaction (fallback "ILS").
     *
     * Linked transfer legs (source + cash-wallet mirror) are excluded from
     * `transferred` in the all-accounts view, so a cross-currency pair can't
     * distort it and a same-currency pair stays neutral. With an `accountId`
     * filter they count as money leaving or entering that account.
     *
     * `income` and `expenses` are net of active reimbursement links: an
     * expense's reimbursed part and an income's allocated part are subtracted
     * (see `ACTIVE_SIDE`). `count` stays the number of rows.
     */
    async getSummary(userId: string, filters?: SummaryTransactionsFilters): Promise<TransactionsSummaryResponseDto> {
        const where = this.buildListWhere(userId, filters);
        // Hidden transactions are unconditionally excluded from totals, even if
        // the list is showing them. Force it regardless of any input filter.
        where.hidden = false;

        const groups = (await this.db.transaction.groupBy({
            by: ["type", "transferDirection"],
            where,
            _sum: { amount: true },
            _count: { _all: true },
        })) as Array<{
            type: string;
            transferDirection: string | null;
            _sum: { amount: unknown };
            _count: { _all: number };
        }>;

        let income = 0;
        let expenses = 0;
        let transferred = 0;
        let count = 0;

        for (const group of groups) {
            // amount is a Prisma Decimal (or null when the bucket has no rows) —
            // convert explicitly, never do arithmetic on the Decimal object.
            const sum = this.decimalToNumber(group._sum.amount);
            count += group._count._all;

            if (group.type === "income") {
                income += sum;
            } else if (group.type === "expense") {
                expenses += sum;
            } else if (group.type === "transfer") {
                // A null/absent direction counts as "out" (+1), matching the web
                // client's convention in Total.vue.
                const sign = group.transferDirection === "in" ? -1 : 1;
                transferred += sign * sum;
            }
        }

        // Net the reimbursement links. Each side is scoped by the same `where`
        // (so a category or search filter applies to that row's own side), and
        // the other side must be active. The `type` is ANDed in, never spread,
        // so a caller's `type` filter can only narrow these queries.
        const [asExpense, asIncome] = await Promise.all([
            this.db.reimbursementAllocation.aggregate({
                where: { expense: { AND: [where, { type: "expense" }] }, income: ACTIVE_SIDE },
                _sum: { amount: true },
            }),
            this.db.reimbursementAllocation.aggregate({
                where: { income: { AND: [where, { type: "income" }] }, expense: ACTIVE_SIDE },
                _sum: { amount: true },
            }),
        ]);
        expenses = fromCents(toCents(expenses) - toCents(this.decimalToNumber(asExpense._sum?.amount)));
        income = fromCents(toCents(income) - toCents(this.decimalToNumber(asIncome._sum?.amount)));

        // Linked transfer legs (a source and its cash-wallet mirror) are backed
        // out of `transferred` in the all-accounts view: a same-currency pair is
        // neutral and a cross-currency pair would otherwise distort the sum.
        if (!filters?.accountId) {
            const existingAnd = where.AND ? (Array.isArray(where.AND) ? where.AND : [where.AND]) : [];
            const linked = (await this.db.transaction.groupBy({
                by: ["transferDirection"],
                where: {
                    ...where,
                    AND: [
                        ...existingAnd,
                        { type: "transfer" },
                        { OR: [{ counterpartOfId: { not: null } }, { counterpart: { isNot: null } }] },
                    ],
                },
                _sum: { amount: true },
            })) as Array<{ transferDirection: string | null; _sum: { amount: unknown } }>;

            for (const bucket of linked) {
                const sign = bucket.transferDirection === "in" ? -1 : 1;
                transferred -= sign * this.decimalToNumber(bucket._sum.amount);
            }
        }

        const net = income - expenses;
        const available = net - transferred;

        // Cheap lookup of the most recent matching transaction's currency for a
        // display hint. Fallback "ILS" when the selection is empty.
        const mostRecent = await this.db.transaction.findFirst({
            where,
            orderBy: { transactionDate: "desc" },
            select: { currency: { select: { code: true } } },
        });
        const currencyCode = mostRecent?.currency?.code ?? "ILS";

        return { income, expenses, net, transferred, available, count, currencyCode };
    }

    /**
     * Lean search for programmatic consumers: scalar fields plus flattened
     * relation names, no attachments. Reuses `buildListWhere` so filters,
     * `userId` and `deletedAt: null` stay in one place. `filters.page/limit`
     * are ignored; the caller supplies `skip`/`take`.
     */
    async searchLean(
        userId: string,
        filters: ListTransactionsFilters,
        page: { skip: number; take: number },
    ): Promise<{ rows: TransactionLeanRow[]; totalCount: number }> {
        const where = this.buildListWhere(userId, filters);
        const sortBy = filters.sortBy ?? "transactionDate";
        const sortOrder = filters.sortOrder ?? "desc";

        const [rows, totalCount] = await this.db.$transaction([
            this.db.transaction.findMany({
                where,
                select: {
                    id: true,
                    transactionDate: true,
                    postedDate: true,
                    type: true,
                    transferDirection: true,
                    amount: true,
                    originalAmount: true,
                    description: true,
                    additionalDescription: true,
                    notes: true,
                    hidden: true,
                    paymentType: true,
                    originalCategory: true,
                    categoryId: true,
                    accountId: true,
                    budgetId: true,
                    currency: { select: { code: true } },
                    originalCurrency: { select: { code: true } },
                    category: { select: { name: true } },
                    account: { select: { name: true } },
                    budget: { select: { name: true } },
                    reimbursedBy: { where: { income: ACTIVE_SIDE }, select: { amount: true } },
                    reimburses: { where: { expense: ACTIVE_SIDE }, select: { amount: true } },
                },
                // id tiebreaker keeps offset pages stable (dates are date-only).
                orderBy: [{ [sortBy]: sortOrder }, { id: "desc" }],
                skip: page.skip,
                take: page.take,
            }),
            this.db.transaction.count({ where }),
        ]);

        return {
            rows: rows.map((row) => ({
                id: row.id,
                transactionDate: row.transactionDate,
                postedDate: row.postedDate ?? null,
                type: row.type,
                transferDirection: row.transferDirection ?? null,
                amount: this.decimalToNumber(row.amount),
                netAmount: this.netAmountOf(row, this.decimalToNumber(row.amount)),
                currencyCode: row.currency?.code,
                originalAmount:
                    row.originalAmount === null || row.originalAmount === undefined
                        ? null
                        : this.decimalToNumber(row.originalAmount),
                originalCurrencyCode: row.originalCurrency?.code ?? null,
                description: row.description,
                additionalDescription: row.additionalDescription ?? null,
                notes: row.notes ?? null,
                hidden: row.hidden,
                paymentType: row.paymentType ?? null,
                originalCategory: row.originalCategory ?? null,
                categoryId: row.categoryId ?? null,
                categoryName: row.category?.name ?? null,
                accountId: row.accountId,
                accountName: row.account?.name,
                budgetId: row.budgetId ?? null,
                budgetName: row.budget?.name ?? null,
            })),
            totalCount,
        };
    }

    /**
     * Grouped sums/counts. Never sums across type or currency: each row is one
     * (key, type, transferDirection, currency) bucket. No FX conversion.
     *
     * Expense and income sums are net of active reimbursement links, keyed by
     * the linked row's own date/category/merchant/account (a month bucket uses
     * the expense's or income's month, not the other side's).
     */
    async aggregate(
        userId: string,
        filters: TransactionAggregateFilters,
        groupBy: TransactionAggregateGroupBy,
    ): Promise<TransactionAggregateRow[]> {
        const where = this.buildListWhere(userId, filters);
        const field = AGGREGATE_FIELD[groupBy];

        const groups = (await this.db.transaction.groupBy({
            by: [field, "type", "transferDirection", "currencyId"],
            where,
            _sum: { amount: true },
            _count: { _all: true },
        })) as unknown as AggregateGroupRow[];

        // Collapse to (key, type, direction, currencyId) buckets; for month this
        // merges the per-date groups into YYYY-MM.
        interface Bucket {
            key: string | null;
            type: string;
            transferDirection: string | null;
            currencyId: string;
            sum: number;
            count: number;
        }
        const keyOf = (row: Record<string, unknown>): string | null =>
            groupBy === "month"
                ? (row.transactionDate as Date).toISOString().slice(0, 7)
                : ((row[field] as string | null | undefined) ?? null);
        const bucketId = (key: string | null, type: string, direction: string | null, currencyId: string) =>
            JSON.stringify([key, type, direction, currencyId]);

        const buckets = new Map<string, Bucket>();
        for (const g of groups) {
            const key = keyOf(g as unknown as Record<string, unknown>);
            const direction: string | null = g.transferDirection ?? null;
            const id = bucketId(key, g.type, direction, g.currencyId);
            const bucket = buckets.get(id) ?? {
                key,
                type: g.type,
                transferDirection: direction,
                currencyId: g.currencyId,
                sum: 0,
                count: 0,
            };
            bucket.sum += this.decimalToNumber(g._sum?.amount);
            bucket.count += g._count?._all ?? 0;
            buckets.set(id, bucket);
        }

        // Net the reimbursement links: an expense's reimbursed part leaves the
        // expense bucket, and an income's allocated part leaves the income
        // bucket, each keyed by that side's own row. Counts are unchanged.
        // Hidden rows stay gross, matching `searchLean`'s netAmount.
        const [expenseLinks, incomeLinks] = await Promise.all([
            this.db.reimbursementAllocation.findMany({
                where: { expense: { AND: [where, { type: "expense", hidden: false }] }, income: ACTIVE_SIDE },
                select: { amount: true, expense: { select: NET_SIDE_SELECT } },
            }),
            this.db.reimbursementAllocation.findMany({
                where: { income: { AND: [where, { type: "income", hidden: false }] }, expense: ACTIVE_SIDE },
                select: { amount: true, income: { select: NET_SIDE_SELECT } },
            }),
        ]);
        const netOut = (side: Record<string, unknown>, amount: unknown) => {
            const bucket = buckets.get(
                bucketId(
                    keyOf(side),
                    side.type as string,
                    (side.transferDirection as string | null) ?? null,
                    side.currencyId as string,
                ),
            );
            if (bucket) bucket.sum -= this.decimalToNumber(amount);
        };
        for (const link of expenseLinks) netOut(link.expense, link.amount);
        for (const link of incomeLinks) netOut(link.income, link.amount);

        const merged = [...buckets.values()];

        const currencyIds = [...new Set(merged.map((b) => b.currencyId))];
        const currencies: Array<{ id: string; code: string }> =
            currencyIds.length > 0
                ? await this.db.currency.findMany({
                      where: { id: { in: currencyIds } },
                      select: { id: true, code: true },
                  })
                : [];
        const currencyCodeById = new Map(currencies.map((c) => [c.id, c.code]));

        const keyIds = [...new Set(merged.map((b) => b.key).filter((k): k is string => k !== null))];
        const labelByKey = new Map<string, string>();
        if (groupBy === "category" && keyIds.length > 0) {
            const cats: Array<{ id: string; name: string }> = await this.db.category.findMany({
                where: { id: { in: keyIds }, OR: [{ isSystem: true }, { userId }] },
                select: { id: true, name: true },
            });
            cats.forEach((c) => labelByKey.set(c.id, c.name));
        } else if (groupBy === "account" && keyIds.length > 0) {
            const accts: Array<{ id: string; name: string }> = await this.db.account.findMany({
                where: { id: { in: keyIds }, userId },
                select: { id: true, name: true },
            });
            accts.forEach((a) => labelByKey.set(a.id, a.name));
        }

        const rows: TransactionAggregateRow[] = merged.map((b) => {
            let label: string;
            if (b.key === null) {
                label = groupBy === "category" ? "Uncategorized" : "Unknown";
            } else if (groupBy === "month" || groupBy === "merchant") {
                label = b.key;
            } else {
                label = labelByKey.get(b.key) ?? b.key;
            }
            return {
                key: b.key,
                label,
                type: b.type,
                transferDirection: b.transferDirection,
                currencyCode: currencyCodeById.get(b.currencyId) ?? "",
                sum: Math.round(b.sum * 100) / 100,
                count: b.count,
            };
        });

        rows.sort((a, b) => b.sum - a.sum || a.label.localeCompare(b.label));
        return rows;
    }

    /**
     * Convert a Prisma `Decimal` (or a null/undefined empty-bucket sum) to a
     * JS number. Handles both real `Decimal` objects (`.toNumber()`) and any
     * stringifiable numeric.
     */
    /**
     * Per-row net for lean search: an active expense minus the income links that
     * reimburse it, or an active income minus the expense links it reimburses.
     * Transfers and hidden rows keep their gross amount.
     */
    private netAmountOf(
        row: {
            type: string;
            hidden: boolean;
            reimbursedBy?: { amount: unknown }[];
            reimburses?: { amount: unknown }[];
        },
        amount: number,
    ): number {
        if ((row.type !== "expense" && row.type !== "income") || row.hidden) return amount;
        const links = row.type === "expense" ? row.reimbursedBy : row.reimburses;
        return netOf(amount, sumAllocations(links ?? []));
    }

    private decimalToNumber(value: unknown): number {
        if (value === null || value === undefined) {
            return 0;
        }
        if (typeof value === "object" && typeof (value as { toNumber?: unknown }).toNumber === "function") {
            return (value as { toNumber: () => number }).toNumber();
        }
        return Number(value);
    }

    async findOne(id: string, userId: string): Promise<TransactionResponseDto> {
        const transaction = await this.db.transaction.findFirst({
            where: {
                id,
                userId,
                deletedAt: null,
            },
            include: this.transactionInclude,
        });

        if (!transaction) {
            throw new NotFoundException(`Transaction with ID ${id} not found`);
        }

        const applicableBudgets = await this.findApplicableBudgets(transaction);

        return { ...this.toTransactionResponse(transaction), applicableBudgets };
    }

    /**
     * Budgets this transaction counts toward: budgets linked to the
     * transaction's category (via budget_categories) whose lifecycle window
     * contains the transaction date, plus the directly linked budget, if any.
     * Only expenses count toward budgets.
     */
    private async findApplicableBudgets(transaction: {
        userId: string;
        type: string;
        categoryId: string | null;
        budgetId: string | null;
        transactionDate: Date;
    }) {
        if (transaction.type !== "expense") {
            return [];
        }

        const matchers: any[] = [];
        if (transaction.categoryId) {
            matchers.push({
                budgetCategories: { some: { categoryId: transaction.categoryId } },
                startDate: { lte: transaction.transactionDate },
                OR: [{ endDate: null }, { endDate: { gte: transaction.transactionDate } }],
            });
        }
        if (transaction.budgetId) {
            matchers.push({ id: transaction.budgetId });
        }
        if (matchers.length === 0) {
            return [];
        }

        const budgets = await this.db.budget.findMany({
            where: {
                userId: transaction.userId,
                deletedAt: null,
                OR: matchers,
            },
            include: { budgetCategories: true },
            orderBy: { createdAt: "asc" },
        });

        return budgets.map(({ budgetCategories, ...budget }: any) => ({
            ...budget,
            categoryIds: budgetCategories.map((link: { categoryId: string }) => link.categoryId),
        }));
    }

    /**
     * The account must belong to the user, and a cash account only holds transactions in its own
     * currency (cash has no FX of its own, so mixing currencies would corrupt the on-hand balance).
     */
    private async assertAccountCurrency(db: any, userId: string, accountId: string, currencyId: string): Promise<void> {
        const account = await db.account.findFirst({
            where: { id: accountId, userId, deletedAt: null },
            select: { type: true, currencyId: true, currency: { select: { code: true } } },
        });
        if (!account) {
            throw new BadRequestException("Account not found");
        }
        if (account.type === "cash" && currencyId !== account.currencyId) {
            throw new BadRequestException(
                `Transactions on a cash account must be in its currency (${account.currency?.code ?? "unknown"})`,
            );
        }
    }

    /**
     * Cheap ownership check for mutations — verifies the transaction exists
     * and belongs to the user without loading relations.
     */
    private async assertTransactionOwned(
        id: string,
        userId: string,
    ): Promise<{ id: string; type: string; transferDirection: string | null; counterpartOfId: string | null }> {
        const transaction = await this.db.transaction.findFirst({
            where: { id, userId, deletedAt: null },
            select: { id: true, type: true, transferDirection: true, counterpartOfId: true },
        });

        if (!transaction) {
            throw new NotFoundException(`Transaction with ID ${id} not found`);
        }

        return transaction;
    }

    /** Ownership check that also loads the fields the synced-row edit lock compares against. */
    private async findForUpdate(
        id: string,
        userId: string,
    ): Promise<
        SyncedLockSnapshot & {
            id: string;
            userId: string;
            hidden: boolean;
            originalAmount: Prisma.Decimal | number | null;
            originalCurrencyId: string | null;
            counterpartOfId: string | null;
            counterpart: ExistingMirror | null;
        }
    > {
        const transaction = await this.db.transaction.findFirst({
            where: { id, userId, deletedAt: null },
            select: {
                id: true,
                type: true,
                transferDirection: true,
                externalId: true,
                amount: true,
                currencyId: true,
                transactionDate: true,
                postedDate: true,
                accountId: true,
                description: true,
                originalCategory: true,
                userId: true,
                hidden: true,
                originalAmount: true,
                originalCurrencyId: true,
                counterpartOfId: true,
                counterpart: { select: { id: true, accountId: true, amount: true } },
            },
        });

        if (!transaction) {
            throw new NotFoundException(`Transaction with ID ${id} not found`);
        }

        return transaction;
    }

    async update(
        id: string,
        userId: string,
        updateTransactionDto: UpdateTransactionDto,
    ): Promise<TransactionResponseDto> {
        const current = await this.findForUpdate(id, userId);
        if (current.counterpartOfId) {
            assertMirrorEditAllowed(updateTransactionDto, await this.findMirrorSource(current.counterpartOfId));
        }
        assertSyncedEditAllowed(current, updateTransactionDto);

        const updateData: any = { ...updateTransactionDto };
        if (current.externalId) {
            // Locked fields were proven equal to the stored values; never write them, so
            // normalisation gaps (e.g. sub-cent amounts) can't alter bank-owned data.
            for (const [field] of LOCKED_FIELDS) delete updateData[field];
        }
        const { counterpartAccountId, counterpartAmount } = updateTransactionDto;
        delete updateData.counterpartAccountId;
        delete updateData.counterpartAmount;
        if (updateData.transactionDate) {
            updateData.transactionDate = new Date(updateData.transactionDate);
        }
        if (updateData.postedDate) {
            updateData.postedDate = new Date(updateData.postedDate);
        }

        // Keep transferDirection coherent with the type.
        if (updateTransactionDto.type === "transfer") {
            // Becoming/keeping a transfer: default a direction only when none
            // exists and none was supplied — never clobber an existing or
            // explicit one (income was money in, anything else money out).
            if (updateData.transferDirection === undefined && !current.transferDirection) {
                updateData.transferDirection = current.type === "income" ? "in" : "out";
            }
        } else if (updateTransactionDto.type) {
            // Explicitly changing to a non-transfer type clears any direction.
            updateData.transferDirection = null;
        } else if (updateData.transferDirection !== undefined && current.type !== "transfer") {
            // Reject a stray direction on a transaction that isn't a transfer.
            updateData.transferDirection = null;
        }

        const updatedRow: TransactionRow = await this.prisma.$transaction(async (tx) => {
            // Lock before reading the sums: a link created after an unlocked read could push the allocated total past
            // the new amount, or let a type/currency change slip past a link that was just written.
            await lockReimbursements(tx, userId);
            const [asExpense, asIncome] = await Promise.all([
                tx.reimbursementAllocation.findMany({ where: { expenseId: id }, select: { amount: true } }),
                tx.reimbursementAllocation.findMany({ where: { incomeId: id }, select: { amount: true } }),
            ]);
            assertReimbursementEditAllowed(
                {
                    type: current.type,
                    amount: current.amount,
                    currencyId: current.currencyId,
                    allocatedAsExpense: sumAllocations(asExpense),
                    allocatedAsIncome: sumAllocations(asIncome),
                },
                updateTransactionDto,
            );
            // Synced rows can't change account/currency (locked), so only manual rows need the check.
            if (
                !current.externalId &&
                (updateTransactionDto.accountId !== undefined || updateTransactionDto.currencyId !== undefined)
            ) {
                await this.assertAccountCurrency(
                    tx,
                    userId,
                    updateTransactionDto.accountId ?? current.accountId,
                    updateTransactionDto.currencyId ?? current.currencyId,
                );
            }
            const row = await tx.transaction.update({ where: { id }, data: updateData });
            await reconcileCounterpart(tx, row, current.counterpart, { counterpartAccountId, counterpartAmount });
            return tx.transaction.findUniqueOrThrow({ where: { id }, include: transactionInclude });
        });
        const updatedTransaction = this.toTransactionResponse(updatedRow);

        await this.snapshotBudgetConversions(userId, updatedTransaction);

        return updatedTransaction;
    }

    async remove(id: string, userId: string) {
        const row = await this.assertTransactionOwned(id, userId);
        if (row.counterpartOfId) {
            assertMirrorDeleteAllowed(await this.findMirrorSource(row.counterpartOfId));
        }

        // Soft-delete the source; the derived mirror is hard-deleted with it. Soft delete never fires the
        // allocation FK cascade, so linked reimbursement allocations are removed explicitly. The lock keeps a
        // concurrent link from inserting an allocation on this row after the cleanup has run.
        return this.prisma.$transaction(async (tx) => {
            await lockReimbursements(tx, userId);
            const deleted = await tx.transaction.update({ where: { id }, data: { deletedAt: new Date() } });
            await tx.transaction.deleteMany({ where: { counterpartOfId: id } });
            await tx.reimbursementAllocation.deleteMany({
                where: { OR: [{ incomeId: id }, { expenseId: id }] },
            });
            return deleted;
        });
    }

    private findMirrorSource(sourceId: string) {
        return this.prisma.transaction.findFirst({
            where: { id: sourceId },
            select: { description: true, account: { select: { name: true } } },
        });
    }

    async addAttachment(
        transactionId: string,
        userId: string,
        createAttachmentDto: CreateTransactionAttachmentDto,
    ): Promise<TransactionAttachmentResponseDto> {
        await this.assertTransactionOwned(transactionId, userId);

        // Metadata-only phase: the file itself is not uploaded yet, so
        // storageKey stays null until the object-storage phase lands.
        return this.db.transactionAttachment.create({
            data: {
                ...createAttachmentDto,
                transactionId,
                userId,
            },
        }) as unknown as TransactionAttachmentResponseDto;
    }

    async removeAttachment(transactionId: string, attachmentId: string, userId: string): Promise<void> {
        const attachment = await this.db.transactionAttachment.findFirst({
            where: {
                id: attachmentId,
                transactionId,
                userId,
                deletedAt: null,
            },
            select: { id: true },
        });

        if (!attachment) {
            throw new NotFoundException(`Attachment with ID ${attachmentId} not found`);
        }

        await this.db.transactionAttachment.update({
            where: { id: attachmentId },
            data: { deletedAt: new Date() },
        });
    }

    private async snapshotBudgetConversions(
        userId: string,
        transaction: { id: string; amount: number; currencyId: string; transactionDate: Date; type: string },
    ) {
        if (transaction.type !== "expense") {
            return;
        }

        const activeBudgetCurrencies = await this.db.budget.findMany({
            where: {
                userId,
                deletedAt: null,
                OR: [{ endDate: null }, { endDate: { gte: new Date() } }],
            },
            select: { currencyId: true },
            distinct: ["currencyId"],
        });

        await Promise.all(
            activeBudgetCurrencies
                .filter(({ currencyId }) => currencyId !== transaction.currencyId)
                .map(({ currencyId }) =>
                    this.fxConversionService.snapshotTransactionConversion({
                        transactionId: transaction.id,
                        sourceCurrencyId: transaction.currencyId,
                        targetCurrencyId: currencyId,
                        amount: Number(transaction.amount),
                        transactionDate: transaction.transactionDate,
                    }),
                ),
        );
    }

    /**
     * Create a card payoff pattern from a description and retag every matching
     * transaction as a hidden transfer (e.g. credit card payoffs).
     * @param id Transaction ID the pattern was created from
     * @param userId User ID
     * @param description Description pattern to create
     * @returns Object with count of updated transactions and the created pattern
     */
    async markAsCardPayoff(id: string, userId: string, description: string) {
        // Verify transaction exists and belongs to user
        await this.assertTransactionOwned(id, userId);

        // Create the pattern (service handles duplicate check)
        const pattern = await this.cardPayoffPatternsService.create(userId, { description });

        // Retag all transactions with matching description
        const result = await this.cardPayoffPatternsService.applyPatternDescription(userId, description);

        return {
            count: result.count,
            pattern,
        };
    }
}
