import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { isUUID } from "class-validator";
import { isOperatorForField, isTransactionType, RULE_FIELD_LABELS } from "@badger/shared-data";
import type { RuleActionType, RuleConditionField, RuleOperator } from "@badger/shared-data";
import type { IRule, RuleDraft, RuleSaveResponse } from "@badger/types";
import { PrismaService } from "../prisma/prisma.service";
import { CreateRuleDto, UpdateRuleDto } from "./dto/rule.dto";
import { ruleInclude, RuleRow, toRuleResponse } from "./rule-mapping";

const AMOUNT_PATTERN = /^\d+(\.\d{1,2})?$/;

interface ValidDraft {
    conditions: { field: RuleConditionField; operator: RuleOperator; value: string }[];
    actions: { type: RuleActionType; value: string }[];
}

@Injectable()
export class RulesService {
    constructor(private readonly prisma: PrismaService) {}

    async findAll(userId: string): Promise<IRule[]> {
        const rows = await this.prisma.rule.findMany({
            where: { userId, deletedAt: null },
            include: ruleInclude,
            orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
        });
        return rows.map((row) => toRuleResponse(row));
    }

    async findOne(id: string, userId: string): Promise<IRule> {
        return toRuleResponse(await this.findRowOrThrow(id, userId));
    }

    async create(userId: string, dto: CreateRuleDto): Promise<RuleSaveResponse> {
        const name = normalizeName(dto.name);
        const draft = await assertValidDraft(this.prisma, userId, dto);

        const last = await this.prisma.rule.findFirst({
            where: { userId, deletedAt: null },
            orderBy: { priority: "desc" },
            select: { priority: true },
        });

        const row = await this.prisma.rule.create({
            data: {
                userId,
                name,
                priority: last ? last.priority + 1 : 1,
                stopOnMatch: dto.stopOnMatch ?? false,
                isActive: true,
                conditions: { create: draft.conditions.map((condition, position) => ({ ...condition, position })) },
                actions: { create: draft.actions.map((action, position) => ({ ...action, position })) },
            },
            include: ruleInclude,
        });

        return { rule: toRuleResponse(row), appliedCount: null };
    }

    async update(id: string, userId: string, dto: UpdateRuleDto): Promise<RuleSaveResponse> {
        await this.assertOwned(id, userId);
        const name = normalizeName(dto.name);
        const draft = await assertValidDraft(this.prisma, userId, dto);

        const row = await this.prisma.$transaction(async (tx) => {
            await tx.ruleCondition.deleteMany({ where: { ruleId: id } });
            await tx.ruleAction.deleteMany({ where: { ruleId: id } });
            await tx.ruleCondition.createMany({
                data: draft.conditions.map((condition, position) => ({ ...condition, ruleId: id, position })),
            });
            await tx.ruleAction.createMany({
                data: draft.actions.map((action, position) => ({ ...action, ruleId: id, position })),
            });
            return tx.rule.update({
                where: { id },
                data: { name, stopOnMatch: dto.stopOnMatch },
                include: ruleInclude,
            });
        });

        return { rule: toRuleResponse(row), appliedCount: null };
    }

    async setActive(id: string, userId: string, isActive: boolean): Promise<IRule> {
        await this.assertOwned(id, userId);
        const row = await this.prisma.rule.update({ where: { id }, data: { isActive }, include: ruleInclude });
        return toRuleResponse(row);
    }

    /** Sets the priority of every non-deleted rule to its position in the ids list (1..n). */
    async reorder(userId: string, ids: string[]): Promise<void> {
        const rules = await this.prisma.rule.findMany({
            where: { userId, deletedAt: null },
            select: { id: true },
        });
        const current = new Set(rules.map((rule) => rule.id));
        const isSameSet =
            new Set(ids).size === ids.length && ids.length === current.size && ids.every((id) => current.has(id));
        if (!isSameSet) {
            throw new ConflictException("The rule list changed. Reload and try again.");
        }

        await this.prisma.$transaction(
            ids.map((id, index) => this.prisma.rule.update({ where: { id }, data: { priority: index + 1 } })),
        );
    }

    /** Soft delete: the rule and its conditions and actions stay in the table, hidden from every read. */
    async remove(id: string, userId: string): Promise<void> {
        await this.assertOwned(id, userId);
        await this.prisma.rule.update({ where: { id }, data: { deletedAt: new Date() } });
    }

    private async findRowOrThrow(id: string, userId: string): Promise<RuleRow> {
        const row = await this.prisma.rule.findFirst({
            where: { id, userId, deletedAt: null },
            include: ruleInclude,
        });
        if (!row) {
            throw new NotFoundException("Rule with ID " + id + " not found");
        }
        return row;
    }

    private async assertOwned(id: string, userId: string): Promise<void> {
        const rule = await this.prisma.rule.findFirst({
            where: { id, userId, deletedAt: null },
            select: { id: true },
        });
        if (!rule) {
            throw new NotFoundException("Rule with ID " + id + " not found");
        }
    }
}

function normalizeName(name: string): string {
    const trimmed = name.trim();
    if (!trimmed) {
        throw new BadRequestException("Enter a name for the rule.");
    }
    return trimmed;
}

/**
 * Checks every condition and action of a draft against the rules vocabulary and the user's own accounts and
 * categories. Returns the draft with values trimmed, ready to store.
 */
async function assertValidDraft(
    db: Pick<PrismaService, "account" | "category">,
    userId: string,
    draft: RuleDraft,
): Promise<ValidDraft> {
    const conditions = draft.conditions.map((condition) => {
        if (!isOperatorForField(condition.field, condition.operator)) {
            throw new BadRequestException(
                "That operator does not apply to " + RULE_FIELD_LABELS[condition.field] + ".",
            );
        }
        return { field: condition.field, operator: condition.operator, value: condition.value.trim() };
    });

    for (const condition of conditions) {
        validateConditionValue(condition);
    }

    const accountIds = conditions.filter((c) => c.field === "account").map((c) => c.value);
    if (accountIds.length > 0) {
        const accounts = await db.account.findMany({
            where: { id: { in: accountIds }, userId, deletedAt: null },
            select: { id: true },
        });
        const found = new Set(accounts.map((account) => account.id));
        if (accountIds.some((id) => !found.has(id))) {
            throw new BadRequestException("Choose an account that exists.");
        }
    }

    const actions = draft.actions.map((action) => ({ type: action.type, value: action.value.trim() }));

    const types = new Set<RuleActionType>();
    for (const action of actions) {
        if (types.has(action.type)) {
            throw new BadRequestException("A rule can have only one " + action.type + " action.");
        }
        types.add(action.type);
    }

    const categoryIds = actions.filter((a) => a.type === "set_category").map((a) => a.value);
    if (categoryIds.some((id) => !isUUID(id, "all"))) {
        throw new BadRequestException("Choose a category that exists.");
    }
    if (categoryIds.length > 0) {
        const categories = await db.category.findMany({
            where: {
                id: { in: categoryIds },
                deletedAt: null,
                OR: [{ isSystem: true }, { userId }],
            },
            select: { id: true },
        });
        const found = new Set(categories.map((category) => category.id));
        if (categoryIds.some((id) => !found.has(id))) {
            throw new BadRequestException("Choose a category that exists.");
        }
    }

    return { conditions, actions };
}

function validateConditionValue(condition: { field: RuleConditionField; value: string }): void {
    if (condition.field === "description" || condition.field === "originalCategory") {
        if (!condition.value) {
            throw new BadRequestException(
                "Enter a value for " + RULE_FIELD_LABELS[condition.field].toLowerCase() + ".",
            );
        }
        return;
    }
    if (condition.field === "amount") {
        if (!AMOUNT_PATTERN.test(condition.value)) {
            throw new BadRequestException("An amount must be a number with at most two decimals.");
        }
        return;
    }
    if (condition.field === "type") {
        if (!isTransactionType(condition.value)) {
            throw new BadRequestException("Choose income, expense or transfer.");
        }
        return;
    }
    if (!isUUID(condition.value, "all")) {
        throw new BadRequestException("Choose an account that exists.");
    }
}
