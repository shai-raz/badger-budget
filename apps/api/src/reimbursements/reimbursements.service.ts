import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import type {
    IReimbursementAllocationResponse,
    IReimbursementCandidate,
    IReimbursementCandidatesResponse,
} from "@badger/types";
import { PrismaService } from "../prisma/prisma.service";
import { fromCents, toCents } from "../transactions/reimbursement-netting";
import { CreateReimbursementAllocationDto } from "./dto/create-reimbursement-allocation.dto";
import { UpdateReimbursementAllocationDto } from "./dto/update-reimbursement-allocation.dto";
import { mergeNearest, parseSearchAmount } from "./candidate-helpers";
import {
    REIMBURSEMENT_SUGGESTION_SOURCES,
    type ReimbursementSuggestionSource,
    type SuggestionSourceTxn,
} from "./suggestion-sources";

type TxClient = Prisma.TransactionClient;

/** Only the fields the link rules need, loaded for both sides of a new link. */
const LINK_SIDE_SELECT = { id: true, type: true, currencyId: true, amount: true, hidden: true } as const;

/** Rows per window (before / after the source date) and per suggested-or-other group. */
export const CANDIDATE_LIMIT = 50;

const CANDIDATE_SELECT = {
    id: true,
    type: true,
    description: true,
    additionalDescription: true,
    amount: true,
    transactionDate: true,
    currency: { select: { code: true } },
    category: { select: { id: true, name: true, color: true, icon: true } },
} as const;

type CandidateRow = Prisma.TransactionGetPayload<{ select: typeof CANDIDATE_SELECT }>;

/**
 * Owns reimbursement allocations (income → expense links). Caps count ALL allocations on a side, active or not:
 * see reimbursement-netting.ts for the netting rule. Every write runs under a per-user advisory lock so two
 * concurrent links can't both pass a cap check.
 */
@Injectable()
export class ReimbursementsService {
    constructor(
        private readonly prisma: PrismaService,
        @Inject(REIMBURSEMENT_SUGGESTION_SOURCES)
        private readonly suggestionSources: ReimbursementSuggestionSource[],
    ) {}

    async create(userId: string, dto: CreateReimbursementAllocationDto): Promise<IReimbursementAllocationResponse> {
        return this.prisma.$transaction(async (tx) => {
            await this.lockUser(tx, userId);

            const [income, expense] = await Promise.all([
                tx.transaction.findFirst({
                    where: { id: dto.incomeId, userId, deletedAt: null },
                    select: LINK_SIDE_SELECT,
                }),
                tx.transaction.findFirst({
                    where: { id: dto.expenseId, userId, deletedAt: null },
                    select: LINK_SIDE_SELECT,
                }),
            ]);
            if (!income) throw new NotFoundException(`Transaction with ID ${dto.incomeId} not found`);
            if (!expense) throw new NotFoundException(`Transaction with ID ${dto.expenseId} not found`);

            this.assertLinkable(income, expense);

            const existing = await tx.reimbursementAllocation.findUnique({
                where: { incomeId_expenseId: { incomeId: dto.incomeId, expenseId: dto.expenseId } },
                select: { id: true },
            });
            if (existing) {
                throw new BadRequestException(
                    "These transactions are already linked. Edit the existing amount instead.",
                );
            }

            await this.assertWithinCaps(tx, {
                incomeId: dto.incomeId,
                expenseId: dto.expenseId,
                incomeAmount: income.amount,
                expenseAmount: expense.amount,
                amount: dto.amount,
            });

            const created = await tx.reimbursementAllocation.create({
                data: { userId, incomeId: dto.incomeId, expenseId: dto.expenseId, amount: dto.amount },
            });
            return toResponse(created);
        });
    }

    async update(
        userId: string,
        id: string,
        dto: UpdateReimbursementAllocationDto,
    ): Promise<IReimbursementAllocationResponse> {
        return this.prisma.$transaction(async (tx) => {
            await this.lockUser(tx, userId);

            const allocation = await tx.reimbursementAllocation.findFirst({
                where: { id, userId },
                include: {
                    income: { select: { amount: true } },
                    expense: { select: { amount: true } },
                },
            });
            if (!allocation) throw new NotFoundException(`Reimbursement with ID ${id} not found`);

            // Exclude this row's own old amount, otherwise editing a link would count it twice.
            await this.assertWithinCaps(tx, {
                incomeId: allocation.incomeId,
                expenseId: allocation.expenseId,
                incomeAmount: allocation.income.amount,
                expenseAmount: allocation.expense.amount,
                amount: dto.amount,
                excludeId: id,
            });

            const updated = await tx.reimbursementAllocation.update({
                where: { id },
                data: { amount: dto.amount },
            });
            return toResponse(updated);
        });
    }

    async remove(userId: string, id: string): Promise<void> {
        const result = await this.prisma.reimbursementAllocation.deleteMany({ where: { id, userId } });
        if (result.count === 0) throw new NotFoundException(`Reimbursement with ID ${id} not found`);
    }

    /**
     * Candidates the picker offers for `transactionId`: the opposite type, same currency, visible, not already linked
     * to it, and with a balance left. Split into `suggested` (matched by a suggestion source) and `other`.
     * Read-only, so it takes no advisory lock.
     */
    async getCandidates(
        userId: string,
        transactionId: string,
        search?: string,
    ): Promise<IReimbursementCandidatesResponse> {
        const source = await this.prisma.transaction.findFirst({
            where: { id: transactionId, userId, deletedAt: null },
            select: {
                id: true,
                type: true,
                amount: true,
                currencyId: true,
                hidden: true,
                transactionDate: true,
                description: true,
                currency: { select: { code: true } },
            },
        });
        if (!source) throw new NotFoundException(`Transaction with ID ${transactionId} not found`);
        if (source.type !== "income" && source.type !== "expense") {
            throw new BadRequestException("Transfers can't be linked as reimbursements.");
        }
        if (source.hidden) throw new BadRequestException("Unhide this transaction to link reimbursements.");

        const sourceType: "income" | "expense" = source.type;
        const candidateType = sourceType === "income" ? "expense" : "income";

        // Remaining balance of the source counts ALL its allocations, like the caps do.
        const sourceAllocatedCents = await this.sumAllocations(
            this.prisma,
            sourceType === "income" ? { incomeId: source.id } : { expenseId: source.id },
        );
        const sourceRemaining = fromCents(Math.max(0, toCents(source.amount) - sourceAllocatedCents));

        const sourceTxn: SuggestionSourceTxn = {
            id: source.id,
            type: sourceType,
            amount: source.amount,
            transactionDate: source.transactionDate,
            currencyId: source.currencyId,
        };
        const suggestedWhere: Prisma.TransactionWhereInput = {
            OR: this.suggestionSources.map((s) => s.suggestedWhere(sourceTxn)),
        };

        const common: Prisma.TransactionWhereInput[] = [
            {
                userId,
                deletedAt: null,
                hidden: false,
                currencyId: source.currencyId,
                type: candidateType,
                id: { not: source.id },
            },
            sourceType === "income"
                ? { reimbursedBy: { none: { incomeId: source.id } } }
                : { reimburses: { none: { expenseId: source.id } } },
        ];

        const term = search?.trim();
        if (term) {
            const amount = parseSearchAmount(term);
            common.push({
                OR: [
                    { description: { contains: term, mode: "insensitive" } },
                    { additionalDescription: { contains: term, mode: "insensitive" } },
                    { category: { name: { contains: term, mode: "insensitive" } } },
                    ...(amount !== null ? [{ amount }] : []),
                ],
            });
        }

        const anchor = source.transactionDate;
        const fetchGroup = async (group: Prisma.TransactionWhereInput) => {
            const [before, after] = await Promise.all([
                this.prisma.transaction.findMany({
                    where: { AND: [...common, group, { transactionDate: { lte: anchor } }] },
                    select: CANDIDATE_SELECT,
                    orderBy: [{ transactionDate: "desc" }, { id: "desc" }],
                    take: CANDIDATE_LIMIT,
                }),
                this.prisma.transaction.findMany({
                    where: { AND: [...common, group, { transactionDate: { gt: anchor } }] },
                    select: CANDIDATE_SELECT,
                    orderBy: [{ transactionDate: "asc" }, { id: "asc" }],
                    take: CANDIDATE_LIMIT,
                }),
            ]);
            return mergeNearest(before, after, anchor, CANDIDATE_LIMIT);
        };

        const [suggestedRows, otherRows] = await Promise.all([
            fetchGroup(suggestedWhere),
            fetchGroup({ NOT: suggestedWhere }),
        ]);

        const allocatedByCandidate = await this.allocatedByCandidate(candidateType, [
            ...suggestedRows.map((row) => row.id),
            ...otherRows.map((row) => row.id),
        ]);

        // Fully allocated candidates are dropped after the window, so a few may fall out of the 50-row cap.
        const toCandidates = (rows: CandidateRow[]): IReimbursementCandidate[] =>
            rows.flatMap((row) => {
                const remainingCents = toCents(row.amount) - (allocatedByCandidate.get(row.id) ?? 0);
                if (remainingCents <= 0) return [];
                return [
                    {
                        id: row.id,
                        type: row.type as "income" | "expense",
                        description: row.description,
                        additionalDescription: row.additionalDescription,
                        amount: fromCents(toCents(row.amount)),
                        remaining: fromCents(remainingCents),
                        transactionDate: row.transactionDate,
                        currencyCode: row.currency.code,
                        category: row.category
                            ? {
                                  id: row.category.id,
                                  name: row.category.name,
                                  color: row.category.color,
                                  icon: row.category.icon,
                              }
                            : null,
                    },
                ];
            });

        return {
            source: {
                id: source.id,
                type: sourceType,
                description: source.description,
                amount: fromCents(toCents(source.amount)),
                remaining: sourceRemaining,
                currencyCode: source.currency.code,
            },
            suggested: toCandidates(suggestedRows),
            other: toCandidates(otherRows),
        };
    }

    /** Allocated cents per candidate id, over ALL allocations on the candidates' side (active or not). */
    private async allocatedByCandidate(
        candidateType: "income" | "expense",
        ids: string[],
    ): Promise<Map<string, number>> {
        if (ids.length === 0) return new Map();
        if (candidateType === "expense") {
            const rows = await this.prisma.reimbursementAllocation.groupBy({
                by: ["expenseId"],
                where: { expenseId: { in: ids } },
                _sum: { amount: true },
            });
            return new Map(rows.map((row): [string, number] => [row.expenseId, toCents(row._sum.amount ?? 0)]));
        }
        const rows = await this.prisma.reimbursementAllocation.groupBy({
            by: ["incomeId"],
            where: { incomeId: { in: ids } },
            _sum: { amount: true },
        });
        return new Map(rows.map((row): [string, number] => [row.incomeId, toCents(row._sum.amount ?? 0)]));
    }

    private assertLinkable(
        income: { type: string; currencyId: string; hidden: boolean },
        expense: { type: string; currencyId: string; hidden: boolean },
    ): void {
        if (income.type === "transfer" || expense.type === "transfer") {
            throw new BadRequestException("Transfers can't be linked as reimbursements.");
        }
        if (income.type !== "income" || expense.type !== "expense") {
            throw new BadRequestException("Only an income can reimburse an expense.");
        }
        if (income.hidden || expense.hidden) {
            throw new BadRequestException("Unhide this transaction to link reimbursements.");
        }
        if (income.currencyId !== expense.currencyId) {
            throw new BadRequestException("A reimbursement must be in the same currency as the expense.");
        }
    }

    /** Both sides: existing allocations (all of them, not only active ones) plus this amount must fit the side's amount. */
    private async assertWithinCaps(
        tx: TxClient,
        link: {
            incomeId: string;
            expenseId: string;
            incomeAmount: unknown;
            expenseAmount: unknown;
            amount: number;
            excludeId?: string;
        },
    ): Promise<void> {
        const exclude = link.excludeId ? { id: { not: link.excludeId } } : {};
        const amountCents = toCents(link.amount);

        const expenseCents = toCents(link.expenseAmount);
        const allocatedToExpense = await this.sumAllocations(tx, { expenseId: link.expenseId, ...exclude });
        if (allocatedToExpense + amountCents > expenseCents) {
            const left = fromCents(Math.max(0, expenseCents - allocatedToExpense));
            throw new BadRequestException(
                `This would reimburse more than the expense amount (${left.toFixed(2)} left).`,
            );
        }

        const incomeCents = toCents(link.incomeAmount);
        const allocatedFromIncome = await this.sumAllocations(tx, { incomeId: link.incomeId, ...exclude });
        if (allocatedFromIncome + amountCents > incomeCents) {
            const left = fromCents(Math.max(0, incomeCents - allocatedFromIncome));
            throw new BadRequestException(`This would allocate more than the income amount (${left.toFixed(2)} left).`);
        }
    }

    /** Sum of matching allocation amounts, in cents. */
    private async sumAllocations(tx: TxClient, where: Prisma.ReimbursementAllocationWhereInput): Promise<number> {
        const result = await tx.reimbursementAllocation.aggregate({ where, _sum: { amount: true } });
        return toCents(result._sum.amount ?? 0);
    }

    /** Per-user advisory lock held until commit. $executeRaw, not $queryRaw: Prisma can't deserialize the void result. */
    private async lockUser(tx: TxClient, userId: string): Promise<void> {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`reimbursement:${userId}`}))`;
    }
}

function toResponse(row: {
    id: string;
    incomeId: string;
    expenseId: string;
    amount: unknown;
    createdAt: Date;
    updatedAt: Date;
}): IReimbursementAllocationResponse {
    return {
        id: row.id,
        incomeId: row.incomeId,
        expenseId: row.expenseId,
        amount: fromCents(toCents(row.amount)),
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
    };
}
