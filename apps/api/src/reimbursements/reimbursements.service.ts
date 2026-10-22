import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import type { IReimbursementAllocationResponse } from "@badger/types";
import { PrismaService } from "../prisma/prisma.service";
import { fromCents, toCents } from "../transactions/reimbursement-netting";
import { CreateReimbursementAllocationDto } from "./dto/create-reimbursement-allocation.dto";
import { UpdateReimbursementAllocationDto } from "./dto/update-reimbursement-allocation.dto";

type TxClient = Prisma.TransactionClient;

/** Only the fields the link rules need, loaded for both sides of a new link. */
const LINK_SIDE_SELECT = { id: true, type: true, currencyId: true, amount: true, hidden: true } as const;

/**
 * Owns reimbursement allocations (income → expense links). Caps count ALL allocations on a side, active or not:
 * see reimbursement-netting.ts for the netting rule. Every write runs under a per-user advisory lock so two
 * concurrent links can't both pass a cap check.
 */
@Injectable()
export class ReimbursementsService {
    constructor(private readonly prisma: PrismaService) {}

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
