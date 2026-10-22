import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CreateBudgetDto, UpdateBudgetDto } from "./dto/budget.dto";
import { ACTIVE_SIDE, netOf, sumAllocations } from "../transactions/reimbursement-netting";
import { BudgetPeriod, getBudgetPeriodWindow } from "./utils/budget-period.util";

@Injectable()
export class BudgetsService {
    constructor(private prisma: PrismaService) {}

    private get db(): any {
        return this.prisma as any;
    }

    async create(userId: string, createBudgetDto: CreateBudgetDto) {
        const categoryIds = this.resolveCategoryIds(createBudgetDto.categoryIds, createBudgetDto.categoryId);
        await this.assertCategoriesOwnedByUser(userId, categoryIds);

        const { categoryIds: _categoryIds, categoryId, ...budgetData } = createBudgetDto;

        return this.db.budget.create({
            data: {
                ...budgetData,
                userId,
                categoryId: categoryId ?? categoryIds[0],
                startDate: new Date(createBudgetDto.startDate),
                endDate: createBudgetDto.endDate ? new Date(createBudgetDto.endDate) : null,
                budgetCategories: {
                    createMany: {
                        data: categoryIds.map((resolvedCategoryId) => ({
                            categoryId: resolvedCategoryId,
                        })),
                    },
                },
            },
            include: this.budgetInclude,
        });
    }

    async findAll(userId: string) {
        const budgets = await this.db.budget.findMany({
            where: {
                userId,
                deletedAt: null,
            },
            include: this.budgetInclude,
            orderBy: { createdAt: "desc" },
        });

        return budgets.map((budget) => this.mapBudgetReadModel(budget));
    }

    async findOne(id: string, userId: string) {
        const budget = await this.db.budget.findFirst({
            where: {
                id,
                userId,
                deletedAt: null,
            },
            include: {
                ...this.budgetInclude,
                transactions: {
                    where: { deletedAt: null },
                },
            },
        });

        if (!budget) {
            throw new NotFoundException(`Budget with ID ${id} not found`);
        }

        return this.mapBudgetReadModel(budget);
    }

    async update(id: string, userId: string, updateBudgetDto: UpdateBudgetDto) {
        await this.findOne(id, userId);

        const updateData: any = { ...updateBudgetDto };
        const hasCategoryPayload = Boolean(updateBudgetDto.categoryIds || updateBudgetDto.categoryId);

        if (hasCategoryPayload) {
            const categoryIds = this.resolveCategoryIds(updateBudgetDto.categoryIds, updateBudgetDto.categoryId);
            await this.assertCategoriesOwnedByUser(userId, categoryIds);
            updateData.categoryId = updateBudgetDto.categoryId ?? categoryIds[0];
            updateData.budgetCategories = {
                deleteMany: {},
                createMany: {
                    data: categoryIds.map((categoryId) => ({ categoryId })),
                },
            };
        }

        if (updateBudgetDto.startDate) {
            updateData.startDate = new Date(updateBudgetDto.startDate);
        }
        if (updateBudgetDto.endDate) {
            updateData.endDate = new Date(updateBudgetDto.endDate);
        }

        delete updateData.categoryIds;

        return this.db.budget.update({
            where: { id },
            data: updateData,
            include: this.budgetInclude,
        });
    }

    async remove(id: string, userId: string) {
        await this.findOne(id, userId);

        return this.db.budget.update({
            where: { id },
            data: { deletedAt: new Date() },
        });
    }

    async getAnalytics(
        id: string,
        userId: string,
        options?: { periodOffset?: number; timeZone?: string; locale?: string },
    ) {
        const budget = await this.db.budget.findFirst({
            where: {
                id,
                userId,
                deletedAt: null,
            },
            include: this.budgetInclude,
        });

        if (!budget) {
            throw new NotFoundException(`Budget with ID ${id} not found`);
        }

        return this.computeBudgetAnalytics(budget, userId, {
            periodOffset: options?.periodOffset,
            timeZone: options?.timeZone,
            locale: options?.locale,
        });
    }

    async getDashboard(
        userId: string,
        options?: {
            period?: BudgetPeriod;
            periodOffset?: number;
            timeZone?: string;
            locale?: string;
        },
    ) {
        const period = options?.period;
        const periodOffset = options?.periodOffset ?? 0;
        const now = new Date();

        const budgets = await this.db.budget.findMany({
            where: {
                userId,
                deletedAt: null,
                ...(period ? { period } : {}),
            },
            include: this.budgetInclude,
            orderBy: { createdAt: "desc" },
        });

        // Default mode (no period): keep legacy behavior — only active budgets at the
        // current period. Section mode (period provided): include every budget of that
        // type (even ended / not-yet-started) so the UI can render a per-budget empty
        // state via `existsInPeriod` instead of hiding the budget.
        const selectedBudgets = period
            ? budgets
            : budgets.filter((budget) => !budget.endDate || new Date(budget.endDate) >= now);

        const budgetAnalytics = await Promise.all(
            selectedBudgets.map((budget) =>
                this.computeBudgetAnalytics(budget, userId, {
                    referenceDate: now,
                    periodOffset,
                    timeZone: options?.timeZone,
                    locale: options?.locale,
                }),
            ),
        );

        // Sort by percentage used (descending); budgets with no data for the viewed
        // window (empty state) sort to the end of the section.
        budgetAnalytics.sort((a, b) => {
            if (a.existsInPeriod !== b.existsInPeriod) {
                return a.existsInPeriod ? -1 : 1;
            }
            return b.percentageUsed - a.percentageUsed;
        });

        const result: Record<string, any> = {
            budgets: budgetAnalytics,
            totalBudgets: budgetAnalytics.length,
            overBudgetCount: budgetAnalytics.filter((b) => b.isOverBudget).length,
        };

        // In section mode expose the section's reference window + cursor so the UI can
        // label the navigation ("June 2026", etc.) independently of any single budget.
        if (period) {
            const sectionWindow = getBudgetPeriodWindow({
                period,
                referenceDate: now,
                periodOffset,
                timeZone: options?.timeZone,
                locale: options?.locale,
            });
            result.period = period;
            result.periodOffset = periodOffset;
            result.periodStart = sectionWindow.periodStart;
            result.periodEnd = sectionWindow.periodEnd;
        }

        return result;
    }

    /**
     * Computes a budget's spend analytics for a single period window (the window
     * `periodOffset` periods away from `referenceDate`). When the window falls
     * entirely outside the budget's [startDate, endDate] lifecycle, returns a
     * zeroed "empty state" entry (`existsInPeriod: false`) and skips the
     * transaction query — used to render "No budget set for this period".
     */
    private async computeBudgetAnalytics(
        budget: any,
        userId: string,
        options: {
            referenceDate?: Date;
            periodOffset?: number;
            timeZone?: string;
            locale?: string;
        },
    ) {
        const periodWindow = getBudgetPeriodWindow({
            period: budget.period as BudgetPeriod,
            referenceDate: options.referenceDate ?? new Date(),
            periodOffset: options.periodOffset ?? 0,
            anchorDate: budget.startDate ? new Date(budget.startDate) : undefined,
            timeZone: options.timeZone,
            locale: options.locale,
        });

        const startDate = budget.startDate ? new Date(budget.startDate) : null;
        const endDate = budget.endDate ? new Date(budget.endDate) : null;
        const existsInPeriod =
            (startDate === null || periodWindow.periodEnd >= startDate) &&
            (endDate === null || periodWindow.periodStart <= endDate);

        const amount = Number(budget.amount);
        const base = {
            budgetId: budget.id,
            budgetName: budget.name,
            amount,
            currencyId: budget.currencyId,
            currencyDisplay: this.toCurrencyDisplay(budget.currency),
            categories: this.extractCategories(budget),
            period: budget.period,
            periodStart: periodWindow.periodStart,
            periodEnd: periodWindow.periodEnd,
            account: budget.account,
        };

        if (!existsInPeriod) {
            return {
                ...base,
                totalSpent: 0,
                remaining: amount,
                percentageUsed: 0,
                transactionCount: 0,
                isOverBudget: false,
                existsInPeriod: false,
            };
        }

        const categoryIds = this.getBudgetCategoryIds(budget);

        // Sum expense transactions within the window whose categories overlap this budget
        const transactions = await this.db.transaction.findMany({
            where: {
                userId,
                categoryId: {
                    in: categoryIds,
                },
                deletedAt: null,
                type: "expense",
                transactionDate: {
                    gte: periodWindow.periodStart,
                    lte: periodWindow.periodEnd,
                },
            },
            include: {
                conversions: {
                    where: {
                        targetCurrencyId: budget.currencyId,
                    },
                    take: 1,
                },
                reimbursedBy: { where: { income: ACTIVE_SIDE }, select: { amount: true } },
            },
        });

        const totalSpent = transactions.reduce((sum, txn) => sum + this.resolveBudgetAmount(txn, budget.currencyId), 0);
        const remaining = amount - totalSpent;
        const percentageUsed = amount > 0 ? (totalSpent / amount) * 100 : 0;

        return {
            ...base,
            totalSpent,
            remaining,
            percentageUsed: Math.round(percentageUsed * 100) / 100,
            transactionCount: transactions.length,
            isOverBudget: totalSpent > amount,
            existsInPeriod: true,
        };
    }

    /**
     * The expense's share that counts against the budget: its amount minus active income reimbursements
     * (hidden expenses keep their gross amount). Cross-currency snapshots hold the gross amount converted,
     * so they are scaled by the net share.
     */
    private resolveBudgetAmount(
        transaction: {
            amount: number;
            currencyId: string;
            hidden?: boolean;
            conversions?: Array<{ convertedAmount: number }>;
            reimbursedBy?: Array<{ amount: unknown }>;
        },
        budgetCurrencyId: string,
    ) {
        const gross = Number(transaction.amount);
        const allocated = transaction.hidden ? 0 : sumAllocations(transaction.reimbursedBy ?? []);
        const net = netOf(gross, allocated);

        if (transaction.currencyId === budgetCurrencyId) {
            return net;
        }

        const conversion = transaction.conversions?.[0];
        if (!conversion) {
            return 0;
        }

        return gross > 0 ? Number(conversion.convertedAmount) * (net / gross) : 0;
    }

    private readonly budgetInclude = {
        currency: true,
        account: true,
        budgetCategories: {
            include: {
                category: true,
            },
        },
    };

    private resolveCategoryIds(categoryIds?: string[], legacyCategoryId?: string) {
        const resolvedCategoryIds = categoryIds?.length ? categoryIds : legacyCategoryId ? [legacyCategoryId] : [];

        if (resolvedCategoryIds.length === 0) {
            throw new BadRequestException("At least one category ID is required");
        }

        return [...new Set(resolvedCategoryIds)];
    }

    private async assertCategoriesOwnedByUser(userId: string, categoryIds: string[]) {
        const ownedCategoriesCount = await this.db.category.count({
            where: {
                id: { in: categoryIds },
                userId,
                deletedAt: null,
            },
        });

        if (ownedCategoriesCount !== categoryIds.length) {
            throw new BadRequestException("One or more category IDs are invalid for this user");
        }
    }

    private extractCategories(budget: { budgetCategories?: Array<{ category: any }> }) {
        return budget.budgetCategories?.map((entry) => entry.category) ?? [];
    }

    private getBudgetCategoryIds(budget: {
        budgetCategories?: Array<{ categoryId: string }>;
        categoryId?: string | null;
    }) {
        const idsFromJoinTable =
            budget.budgetCategories
                ?.map((entry) => entry.categoryId)
                .filter((categoryId): categoryId is string => Boolean(categoryId)) ?? [];

        if (idsFromJoinTable.length > 0) {
            return idsFromJoinTable;
        }

        if (budget.categoryId) {
            return [budget.categoryId];
        }

        return [];
    }

    private toCurrencyDisplay(currency: { code: string; symbol: string }) {
        return {
            code: currency.code,
            symbol: currency.symbol,
        };
    }

    private mapBudgetReadModel(
        budget: Record<string, any> & {
            currency: { code: string; symbol: string };
            budgetCategories?: Array<{ category: any }>;
            category?: any;
        },
    ) {
        const { category: _legacyCategory, ...rest } = budget;

        return {
            ...rest,
            categories: this.extractCategories(budget),
            currencyDisplay: this.toCurrencyDisplay(budget.currency),
        };
    }
}
