import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { defaultCategoryIcon } from "@badger/shared-data";
import { CreateCategoryDto, UpdateCategoryDto, DeleteCategoryDto } from "./dto/category.dto";
import { countCategoryRules, deleteCategoryRules, moveCategoryRules } from "../rules/rule-cleanup";

@Injectable()
export class CategoriesService {
    constructor(private prisma: PrismaService) {}

    async create(userId: string, createCategoryDto: CreateCategoryDto) {
        // Check for duplicate category name for this user
        const existing = await this.prisma.category.findFirst({
            where: {
                userId,
                name: createCategoryDto.name,
                deletedAt: null,
            },
        });

        if (existing) {
            throw new BadRequestException(`A category with the name "${createCategoryDto.name}" already exists`);
        }

        return this.prisma.category.create({
            data: {
                ...createCategoryDto,
                // An explicit null is stored as null (no icon); only an omitted icon gets a name-based default.
                icon:
                    createCategoryDto.icon !== undefined
                        ? createCategoryDto.icon
                        : defaultCategoryIcon(createCategoryDto.name),
                userId,
                isSystem: false,
            },
        });
    }

    async findAll(userId: string) {
        // Return both system categories and user's own categories
        return this.prisma.category.findMany({
            where: {
                OR: [
                    { isSystem: true, deletedAt: null },
                    { userId, deletedAt: null },
                ],
            },
            orderBy: [
                { isSystem: "desc" }, // System categories first
                { name: "asc" },
            ],
        });
    }

    async findOne(id: string, userId: string) {
        const category = await this.prisma.category.findFirst({
            where: {
                id,
                OR: [{ isSystem: true }, { userId }],
                deletedAt: null,
            },
        });

        if (!category) {
            throw new NotFoundException(`Category with ID ${id} not found`);
        }

        return category;
    }

    async update(id: string, userId: string, updateCategoryDto: UpdateCategoryDto) {
        const category = await this.findOne(id, userId);

        // Cannot update system categories
        if (category.isSystem) {
            throw new ForbiddenException("Cannot update system categories");
        }

        // Check for duplicate category name for this user (excluding current category)
        if (updateCategoryDto.name) {
            const existing = await this.prisma.category.findFirst({
                where: {
                    userId,
                    name: updateCategoryDto.name,
                    deletedAt: null,
                    NOT: { id },
                },
            });

            if (existing) {
                throw new BadRequestException(`A category with the name "${updateCategoryDto.name}" already exists`);
            }
        }

        return this.prisma.category.update({
            where: { id },
            data: updateCategoryDto,
        });
    }

    async remove(id: string, userId: string, dto: DeleteCategoryDto = {}) {
        const category = await this.findOne(id, userId);

        // Cannot delete system categories
        if (category.isSystem) {
            throw new ForbiddenException("Cannot delete system categories");
        }

        const targetId = dto.transferToCategoryId ?? null;
        const moving = targetId !== null;

        if (moving) {
            if (targetId === id) {
                throw new BadRequestException("Cannot transfer a category's data to itself");
            }
            // Validates the target exists, is owned/system, and is not soft-deleted.
            await this.findOne(targetId, userId);
        }

        // Only meaningful when moving. Defaults to true.
        const moveRules = dto.moveRules !== false;

        return this.prisma.$transaction(async (tx) => {
            // Transactions: re-point or detach. No deletedAt filter so trashed rows move too (matches prior behavior).
            await tx.transaction.updateMany({
                where: { categoryId: id, userId },
                data: { categoryId: targetId },
            });

            // Budgets: legacy scalar categoryId.
            await tx.budget.updateMany({
                where: { categoryId: id, userId },
                data: { categoryId: targetId },
            });

            // Budget join rows (many-to-many).
            if (moving) {
                const target = targetId as string;
                // Budgets already linked to the target would collide on the (budgetId, categoryId)
                // primary key, so delete the source rows for those budgets before re-pointing the rest.
                const alreadyLinked = await tx.budgetCategory.findMany({
                    where: { categoryId: target },
                    select: { budgetId: true },
                });
                const collidingBudgetIds = alreadyLinked.map((row) => row.budgetId);
                if (collidingBudgetIds.length > 0) {
                    await tx.budgetCategory.deleteMany({
                        where: { categoryId: id, budgetId: { in: collidingBudgetIds } },
                    });
                }
                await tx.budgetCategory.updateMany({
                    where: { categoryId: id },
                    data: { categoryId: target },
                });
            } else {
                // Leaving uncategorized: remove the join rows (they would otherwise be orphaned — this fixes a latent bug).
                await tx.budgetCategory.deleteMany({ where: { categoryId: id } });
            }

            // Rules: re-point to the target (dropping duplicates), or soft-delete them.
            if (moving && moveRules) {
                await moveCategoryRules(tx, userId, id, targetId as string);
            } else {
                await deleteCategoryRules(tx, userId, id);
            }

            // Soft delete the category.
            return tx.category.update({
                where: { id },
                data: { deletedAt: new Date() },
            });
        });
    }

    async getUsageCount(id: string, userId: string) {
        // Verify category exists and user has access
        await this.findOne(id, userId);

        const [transactionCount, budgetCount, ruleCount] = await Promise.all([
            this.prisma.transaction.count({
                where: { categoryId: id, userId, deletedAt: null },
            }),
            this.prisma.budget.count({
                where: {
                    userId,
                    deletedAt: null,
                    OR: [{ categoryId: id }, { budgetCategories: { some: { categoryId: id } } }],
                },
            }),
            countCategoryRules(this.prisma, userId, id),
        ]);

        return {
            transactionCount,
            budgetCount,
            ruleCount,
            totalCount: transactionCount + budgetCount + ruleCount,
        };
    }
}
