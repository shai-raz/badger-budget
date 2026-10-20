import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CreateCategoryMappingRuleDto, UpdateCategoryMappingRuleDto } from "./dto/category-mapping-rule.dto";
import { findMatchingCategoryId } from "@badger/utils";

@Injectable()
export class CategoryMappingRulesService {
    constructor(private prisma: PrismaService) {}

    async create(userId: string, createCategoryMappingRuleDto: CreateCategoryMappingRuleDto) {
        // Auto-increment priority: find max priority and add 1
        const maxPriorityRule = await this.prisma.categoryMappingRule.findFirst({
            where: {
                userId,
                isActive: true,
            },
            orderBy: {
                priority: "desc",
            },
            select: {
                priority: true,
            },
        });

        const priority = maxPriorityRule ? maxPriorityRule.priority + 1 : 1;

        return this.prisma.categoryMappingRule.create({
            data: {
                userId,
                categoryId: createCategoryMappingRuleDto.categoryId,
                field: createCategoryMappingRuleDto.field,
                operator: createCategoryMappingRuleDto.operator,
                value: createCategoryMappingRuleDto.value,
                priority,
                stopOnMatch: createCategoryMappingRuleDto.stopOnMatch ?? true,
            },
            include: {
                category: true,
            },
        });
    }

    async findAll(userId: string) {
        return this.prisma.categoryMappingRule.findMany({
            where: {
                userId,
                isActive: true,
            },
            include: {
                category: true,
            },
            orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
        });
    }

    async findOne(id: string, userId: string) {
        const rule = await this.prisma.categoryMappingRule.findFirst({
            where: {
                id,
                userId,
                isActive: true,
            },
            include: {
                category: true,
            },
        });

        if (!rule) {
            throw new NotFoundException(`Category mapping rule with ID ${id} not found`);
        }

        return rule;
    }

    async update(id: string, userId: string, updateCategoryMappingRuleDto: UpdateCategoryMappingRuleDto) {
        await this.findOne(id, userId);

        return this.prisma.categoryMappingRule.update({
            where: { id },
            data: updateCategoryMappingRuleDto,
            include: {
                category: true,
            },
        });
    }

    async remove(id: string, userId: string) {
        await this.findOne(id, userId);

        // Mark as inactive instead of deleting
        return this.prisma.categoryMappingRule.update({
            where: { id },
            data: { isActive: false },
        });
    }

    /**
     * Apply mapping rules to a transaction description to find matching category
     */
    async findMatchingCategory(
        userId: string,
        transactionData: {
            description: string;
            originalCategory?: string;
            amount?: number;
        },
    ): Promise<string | null> {
        const rules = await this.findAll(userId);
        return findMatchingCategoryId(transactionData, rules as any);
    }

    /**
     * Apply a specific rule to all user transactions that match
     * Returns the number of transactions updated
     */
    async applyRuleToAllTransactions(ruleId: string, userId: string): Promise<number> {
        // Get the specific rule
        const rule = await this.findOne(ruleId, userId);

        // Get all transactions for the user (excluding deleted)
        const transactions = await this.prisma.transaction.findMany({
            where: {
                userId,
                deletedAt: null,
                counterpartOfId: null,
            },
            select: {
                id: true,
                description: true,
                originalCategory: true,
                amount: true,
            },
        });

        // Find matching transaction IDs
        const matchingTransactionIds: string[] = [];

        for (const transaction of transactions) {
            const transactionData = {
                description: transaction.description,
                originalCategory: transaction.originalCategory || undefined,
                amount: transaction.amount ? parseFloat(transaction.amount.toString()) : undefined,
            };

            const matchedCategoryId = findMatchingCategoryId(transactionData, [rule as any]);

            if (matchedCategoryId) {
                matchingTransactionIds.push(transaction.id);
            }
        }

        // Batch update matching transactions
        if (matchingTransactionIds.length > 0) {
            const result = await this.prisma.transaction.updateMany({
                where: {
                    id: {
                        in: matchingTransactionIds,
                    },
                },
                data: {
                    categoryId: rule.categoryId,
                },
            });

            return result.count;
        }

        return 0;
    }
}
