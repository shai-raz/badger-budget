import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { isUUID } from "class-validator";
import type { Prisma } from "@prisma/client";
import { isOperatorForField, isTransactionType, RULE_FIELD_LABELS, RULE_PREVIEW_PAGE_SIZE } from "@badger/shared-data";
import type { RuleActionType, RuleConditionField, RuleOperator } from "@badger/shared-data";
import type {
    ApplyRuleResponse,
    IRule,
    RuleDraft,
    RulePreviewItem,
    RulePreviewResponse,
    RuleSaveResponse,
} from "@badger/types";
import { toIsoDateString } from "@badger/utils";
import { PrismaService } from "../prisma/prisma.service";
import { ApplyRuleSelectionDto, CreateRuleDto, RulePreviewDto, UpdateRuleDto } from "./dto/rule.dto";
import { ruleInclude, RuleRow, toRuleResponse } from "./rule-mapping";
import {
    applyRuleSelection,
    comparePreviewOrder,
    loadRuleCandidates,
    matchesPreviewFilter,
    partitionMatches,
    previewTotalPages,
    RuleCandidate,
} from "./rule-matches";

const AMOUNT_PATTERN = /^\d+(\.\d{1,2})?$/;

/** Save-and-apply can rewrite every matching transaction, so it gets more time than the Prisma default of 5 seconds. */
const SAVE_AND_APPLY_TIMEOUT_MS = 60_000;

type Db = Prisma.TransactionClient | PrismaService;

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
        const apply = dto.apply;

        const save = async (db: Db): Promise<RuleSaveResponse> => {
            const rule = await this.insertRule(db, userId, name, dto, draft);
            const appliedCount = apply ? await applyRuleSelection(db, userId, draft, apply) : null;
            return { rule, appliedCount };
        };

        if (!apply) return save(this.prisma);
        return this.prisma.$transaction(save, { timeout: SAVE_AND_APPLY_TIMEOUT_MS });
    }

    async update(id: string, userId: string, dto: UpdateRuleDto): Promise<RuleSaveResponse> {
        await this.assertOwned(id, userId);
        const name = normalizeName(dto.name);
        const draft = await assertValidDraft(this.prisma, userId, dto);
        const apply = dto.apply;

        const save = async (db: Db): Promise<RuleSaveResponse> => {
            const rule = await this.replaceRule(db, id, name, dto, draft);
            const appliedCount = apply ? await applyRuleSelection(db, userId, draft, apply) : null;
            return { rule, appliedCount };
        };

        if (!apply) return this.prisma.$transaction(save);
        return this.prisma.$transaction(save, { timeout: SAVE_AND_APPLY_TIMEOUT_MS });
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

    /** Lists the transactions a draft would change, filtered, searched and paged. Totals ignore search and filter. */
    async preview(userId: string, dto: RulePreviewDto): Promise<RulePreviewResponse> {
        const draft = await assertValidDraft(this.prisma, userId, dto);
        const { matched, wouldChange, alreadyTarget } = partitionMatches(
            await loadRuleCandidates(this.prisma, userId),
            draft,
        );

        const needle = dto.search?.trim().toLowerCase() ?? "";
        const searched = needle
            ? wouldChange.filter((candidate) => candidate.description.toLowerCase().includes(needle))
            : wouldChange;
        const counts = {
            all: searched.length,
            uncategorized: searched.filter((candidate) => candidate.categoryId === null).length,
            categorized: searched.filter((candidate) => candidate.categoryId !== null).length,
        };

        const filter = dto.filter ?? "all";
        const filtered = searched
            .filter((candidate) => matchesPreviewFilter(candidate, filter))
            .sort(comparePreviewOrder);
        const page = dto.page ?? 1;
        const pageRows = filtered.slice((page - 1) * RULE_PREVIEW_PAGE_SIZE, page * RULE_PREVIEW_PAGE_SIZE);

        return {
            matchCount: matched.length,
            wouldChangeCount: wouldChange.length,
            alreadyTargetCount: alreadyTarget.length,
            counts,
            items: await this.loadPreviewItems(userId, pageRows),
            page,
            totalPages: previewTotalPages(filtered.length),
        };
    }

    /**
     * Sets the category of the transactions a saved rule would change, limited to the selection. The stored rule is
     * re-checked like a draft, because categories can be deleted after the rule was saved.
     */
    async apply(id: string, userId: string, selection: ApplyRuleSelectionDto): Promise<ApplyRuleResponse> {
        const rule = await this.findOne(id, userId);
        const draft = await assertValidDraft(this.prisma, userId, rule);
        // A stored set_category row dropped as invalid would leave no target, and apply would uncategorize.
        if (!draft.actions.some((action) => action.type === "set_category")) {
            throw new BadRequestException("Choose a category that exists.");
        }
        const count = await applyRuleSelection(this.prisma, userId, draft, selection);
        return { count };
    }

    private async insertRule(
        db: Db,
        userId: string,
        name: string,
        dto: CreateRuleDto,
        draft: ValidDraft,
    ): Promise<IRule> {
        const last = await db.rule.findFirst({
            where: { userId, deletedAt: null },
            orderBy: { priority: "desc" },
            select: { priority: true },
        });

        const row = await db.rule.create({
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
        return toRuleResponse(row);
    }

    private async replaceRule(db: Db, id: string, name: string, dto: UpdateRuleDto, draft: ValidDraft): Promise<IRule> {
        await db.ruleCondition.deleteMany({ where: { ruleId: id } });
        await db.ruleAction.deleteMany({ where: { ruleId: id } });
        await db.ruleCondition.createMany({
            data: draft.conditions.map((condition, position) => ({ ...condition, ruleId: id, position })),
        });
        await db.ruleAction.createMany({
            data: draft.actions.map((action, position) => ({ ...action, ruleId: id, position })),
        });
        const row = await db.rule.update({
            where: { id },
            data: { name, stopOnMatch: dto.stopOnMatch },
            include: ruleInclude,
        });
        return toRuleResponse(row);
    }

    /** Preview rows in page order, with the account, currency and category details the list shows. */
    private async loadPreviewItems(userId: string, rows: RuleCandidate[]): Promise<RulePreviewItem[]> {
        if (rows.length === 0) return [];

        const details = await this.prisma.transaction.findMany({
            where: { id: { in: rows.map((row) => row.id) }, userId },
            select: {
                id: true,
                description: true,
                transactionDate: true,
                amount: true,
                currency: { select: { code: true } },
                account: { select: { name: true } },
                category: { select: { id: true, name: true, color: true, icon: true } },
            },
        });
        const byId = new Map(details.map((detail) => [detail.id, detail]));

        return rows.flatMap((row) => {
            const detail = byId.get(row.id);
            if (!detail) return [];
            return [
                {
                    id: detail.id,
                    description: detail.description,
                    transactionDate: toIsoDateString(detail.transactionDate),
                    amount: Number(detail.amount),
                    type: row.type,
                    currencyCode: detail.currency.code,
                    accountName: detail.account.name,
                    category: detail.category,
                },
            ];
        });
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
 * Checks every condition and action of a draft against the rules vocabulary and the own accounts and
 * categories of the user. Returns the draft with values trimmed, ready to store.
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
