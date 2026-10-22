import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CreateCardPayoffPatternDto } from "./dto/create-card-payoff-pattern.dto";
import { lockReimbursements } from "../transactions/reimbursement-lock";
import type { ICardPayoffLinkPreview } from "@badger/types";

@Injectable()
export class CardPayoffPatternsService {
    constructor(private prisma: PrismaService) {}

    async create(userId: string, createDto: CreateCardPayoffPatternDto) {
        // Check if pattern already exists for this user
        const existing = await this.prisma.cardPayoffPattern.findFirst({
            where: {
                description: createDto.description,
                OR: [{ userId }, { isSystem: true }],
            },
        });

        if (existing) {
            throw new BadRequestException(`A pattern for "${createDto.description}" already exists`);
        }

        return this.prisma.cardPayoffPattern.create({
            data: {
                description: createDto.description,
                userId,
                isSystem: false,
            },
        });
    }

    async findAll(userId: string) {
        // Return both system patterns and user's own patterns
        return this.prisma.cardPayoffPattern.findMany({
            where: {
                OR: [{ isSystem: true }, { userId }],
            },
            orderBy: [
                { isSystem: "desc" }, // System patterns first
                { createdAt: "desc" },
            ],
        });
    }

    async findOne(id: string, userId: string) {
        const pattern = await this.prisma.cardPayoffPattern.findFirst({
            where: {
                id,
                OR: [{ isSystem: true }, { userId }],
            },
        });

        if (!pattern) {
            throw new NotFoundException(`Card payoff pattern with ID ${id} not found`);
        }

        return pattern;
    }

    async remove(id: string, userId: string) {
        const pattern = await this.findOne(id, userId);

        // Cannot delete system patterns
        if (pattern.isSystem) {
            throw new ForbiddenException("Cannot delete system patterns");
        }

        // Hard delete since we don't have soft delete on this table
        return this.prisma.cardPayoffPattern.delete({
            where: { id },
        });
    }

    /**
     * Check if a transaction description matches any card payoff pattern
     * @param description The transaction description to check
     * @param userId The user ID to check patterns for
     * @returns true if the description matches a pattern, false otherwise
     */
    async checkDescription(description: string, userId: string): Promise<boolean> {
        const pattern = await this.prisma.cardPayoffPattern.findFirst({
            where: {
                description,
                OR: [{ userId }, { isSystem: true }],
            },
        });

        return !!pattern;
    }

    /**
     * Retag every transaction matching a pattern description as a hidden
     * transfer. Direction follows the bucket the transaction came from
     * (expense = money out, income = money in); visible transfers that match
     * are re-hidden without touching their direction.
     *
     * Card payoff wins over reimbursement links: every expense/income row that
     * is about to become a transfer loses its links in the same transaction.
     * @returns Count of transactions updated and reimbursement links removed
     */
    async applyPatternDescription(
        userId: string,
        description: string,
    ): Promise<{ count: number; linksRemoved: number }> {
        const base = { userId, description, deletedAt: null };

        return this.prisma.$transaction(async (tx) => {
            await lockReimbursements(tx, userId);

            const affected = await tx.transaction.findMany({
                where: { ...base, type: { in: ["expense", "income"] } },
                select: { id: true },
            });
            const ids = affected.map((row) => row.id);

            let linksRemoved = 0;
            if (ids.length > 0) {
                const removed = await tx.reimbursementAllocation.deleteMany({
                    where: { OR: [{ incomeId: { in: ids } }, { expenseId: { in: ids } }] },
                });
                linksRemoved = removed.count;
            }

            const fromExpense = await tx.transaction.updateMany({
                where: { ...base, type: "expense" },
                data: { type: "transfer", hidden: true, transferDirection: "out" },
            });
            const fromIncome = await tx.transaction.updateMany({
                where: { ...base, type: "income" },
                data: { type: "transfer", hidden: true, transferDirection: "in" },
            });
            const rehidden = await tx.transaction.updateMany({
                where: { ...base, type: "transfer", hidden: false, counterpartOfId: null, counterpart: { is: null } },
                data: { hidden: true },
            });

            return { count: fromExpense.count + fromIncome.count + rehidden.count, linksRemoved };
        });
    }

    /**
     * Preview how many reimbursement links and linked transactions a set of
     * card payoff descriptions would affect, before applying them.
     * @param userId The user ID
     * @param descriptions Pattern descriptions to preview
     */
    async previewLinkRemoval(userId: string, descriptions: string[]): Promise<ICardPayoffLinkPreview> {
        if (descriptions.length === 0) return { linkedTransactions: 0, links: 0 };

        const [linkedTransactions, links] = await Promise.all([
            this.prisma.transaction.count({
                where: {
                    userId,
                    deletedAt: null,
                    description: { in: descriptions },
                    type: { in: ["expense", "income"] },
                    OR: [{ reimbursedBy: { some: {} } }, { reimburses: { some: {} } }],
                },
            }),
            this.prisma.reimbursementAllocation.count({
                where: {
                    userId,
                    OR: [
                        { income: { userId, deletedAt: null, description: { in: descriptions } } },
                        { expense: { userId, deletedAt: null, description: { in: descriptions } } },
                    ],
                },
            }),
        ]);

        return { linkedTransactions, links };
    }

    /**
     * Preview the link removal that applying all of the user's patterns would cause.
     * @param userId The user ID
     */
    async previewApplyAllLinkRemoval(userId: string): Promise<ICardPayoffLinkPreview> {
        const patterns = await this.findAll(userId);
        return this.previewLinkRemoval(
            userId,
            patterns.map((pattern) => pattern.description),
        );
    }

    /**
     * Apply all card payoff patterns to user's existing transactions
     * @param userId The user ID
     * @returns Count of transactions updated and reimbursement links removed
     */
    async applyAllPatternsToTransactions(userId: string): Promise<{ count: number; linksRemoved: number }> {
        // Get all patterns (system + user)
        const patterns = await this.findAll(userId);

        let totalUpdated = 0;
        let totalLinksRemoved = 0;

        // Apply each pattern
        for (const pattern of patterns) {
            const result = await this.applyPatternDescription(userId, pattern.description);
            totalUpdated += result.count;
            totalLinksRemoved += result.linksRemoved;
        }

        return { count: totalUpdated, linksRemoved: totalLinksRemoved };
    }
}
