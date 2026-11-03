import type { Prisma } from "@prisma/client";
import type { AccountRuleOutcome } from "@badger/shared-data";
import type { IRule, IRuleAction, IRuleCondition } from "@badger/types";
import type { PrismaService } from "../prisma/prisma.service";
import { ruleInclude, RuleRow, toRuleResponse } from "./rule-mapping";

type Db = Prisma.TransactionClient | PrismaService;

/** The parts of a rule that decide whether two rules are duplicates. */
type RuleShape = {
    conditions: Pick<IRuleCondition, "field" | "operator" | "value">[];
    actions: Pick<IRuleAction, "type" | "value">[];
};

const ITEM_SEPARATOR = "\u0001";
const GROUP_SEPARATOR = "\u0002";

/**
 * Identifies a rule by its content, ignoring order: the sorted conditions, then the sorted actions. Two rules with
 * the same signature do the same thing, so one of them is redundant.
 */
export function ruleSignature(rule: RuleShape): string {
    const conditions = rule.conditions.map((c) => [c.field, c.operator, c.value].join("\0")).sort();
    const actions = rule.actions.map((a) => [a.type, a.value].join("\0")).sort();
    return conditions.join(ITEM_SEPARATOR) + GROUP_SEPARATOR + actions.join(ITEM_SEPARATOR);
}

/** Live rules of the user whose set_category action points at the category. */
function categoryRulesWhere(userId: string, categoryId: string): Prisma.RuleWhereInput {
    return {
        userId,
        deletedAt: null,
        actions: { some: { type: "set_category", value: categoryId } },
    };
}

/** Live rules matching `where`, in priority order, mapped to the API shape. */
async function loadRules(db: Db, where: Prisma.RuleWhereInput): Promise<IRule[]> {
    const rows: RuleRow[] = await db.rule.findMany({
        where,
        include: ruleInclude,
        orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
    });
    return rows.map((row) => toRuleResponse(row));
}

function isAccountCondition(condition: IRuleCondition, accountId: string): boolean {
    return condition.field === "account" && condition.operator === "equals" && condition.value === accountId;
}

/** Live rules that have at least one condition on the account, in priority order. */
function rulesUsingAccount(db: Db, userId: string, accountId: string): Promise<IRule[]> {
    return loadRules(db, {
        userId,
        deletedAt: null,
        conditions: { some: { field: "account", value: accountId } },
    });
}

/**
 * Re-points the user's rules from one category to another. A source rule whose content already exists on a rule
 * targeting `toId` (or on an earlier source rule that is kept) is soft-deleted instead, so the move does not leave
 * duplicates behind.
 */
export async function moveCategoryRules(tx: Db, userId: string, fromId: string, toId: string): Promise<void> {
    const sources = await loadRules(tx, categoryRulesWhere(userId, fromId));
    const targets = await loadRules(tx, categoryRulesWhere(userId, toId));

    const taken = new Set(targets.map((rule) => ruleSignature(rule)));
    const dropIds: string[] = [];
    const moveIds: string[] = [];
    for (const rule of sources) {
        const retargeted = {
            conditions: rule.conditions,
            actions: rule.actions.map((action) =>
                action.type === "set_category" && action.value === fromId ? { ...action, value: toId } : action,
            ),
        };
        const signature = ruleSignature(retargeted);
        if (taken.has(signature)) {
            dropIds.push(rule.id);
        } else {
            taken.add(signature);
            moveIds.push(rule.id);
        }
    }

    if (dropIds.length > 0) {
        await tx.rule.updateMany({ where: { id: { in: dropIds } }, data: { deletedAt: new Date() } });
    }
    if (moveIds.length > 0) {
        await tx.ruleAction.updateMany({
            where: { ruleId: { in: moveIds }, type: "set_category", value: fromId },
            data: { value: toId },
        });
    }
}

/** Soft-deletes every live rule whose set_category action points at the category. Returns how many. */
export async function deleteCategoryRules(tx: Db, userId: string, categoryId: string): Promise<number> {
    const { count } = await tx.rule.updateMany({
        where: categoryRulesWhere(userId, categoryId),
        data: { deletedAt: new Date() },
    });
    return count;
}

export function countCategoryRules(db: Db, userId: string, categoryId: string): Promise<number> {
    return db.rule.count({ where: categoryRulesWhere(userId, categoryId) });
}

/**
 * The live rules that test this account, in priority order, with what deleting the account does to each: a rule
 * that tests only this account is deleted, a rule with other conditions loses the account condition.
 */
export async function accountRuleUsage(
    db: Db,
    userId: string,
    accountId: string,
): Promise<{ id: string; name: string; outcome: AccountRuleOutcome }[]> {
    const rules = await rulesUsingAccount(db, userId, accountId);
    return rules.map((rule) => ({
        id: rule.id,
        name: rule.name,
        outcome: rule.conditions.every((condition) => isAccountCondition(condition, accountId))
            ? "rule_deleted"
            : "condition_removed",
    }));
}

/**
 * Applies an account deletion to the rules: rules that test only this account are soft-deleted, and the account
 * condition is removed from the rules that test other things too.
 */
export async function removeAccountFromRules(tx: Db, userId: string, accountId: string): Promise<void> {
    const rules = await rulesUsingAccount(tx, userId, accountId);

    const deleteIds: string[] = [];
    const survivorIds: string[] = [];
    for (const rule of rules) {
        if (rule.conditions.every((condition) => isAccountCondition(condition, accountId))) {
            deleteIds.push(rule.id);
        } else {
            survivorIds.push(rule.id);
        }
    }

    if (deleteIds.length > 0) {
        await tx.rule.updateMany({ where: { id: { in: deleteIds } }, data: { deletedAt: new Date() } });
    }
    if (survivorIds.length > 0) {
        await tx.ruleCondition.deleteMany({
            where: { ruleId: { in: survivorIds }, field: "account", value: accountId },
        });
    }
}
