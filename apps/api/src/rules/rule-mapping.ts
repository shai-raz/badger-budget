import type { Prisma } from "@prisma/client";
import type { IRule, IRuleAction, IRuleCondition } from "@badger/types";
import { isOperatorForField, isRuleActionType, isRuleConditionField, isRuleOperator } from "@badger/shared-data";
import type { MatchableRule } from "@badger/utils";
import type { PrismaService } from "../prisma/prisma.service";

type Db = Prisma.TransactionClient | PrismaService;

export const ruleInclude = {
    conditions: { orderBy: { position: "asc" } },
    actions: { orderBy: { position: "asc" } },
} satisfies Prisma.RuleInclude;

export type RuleRow = Prisma.RuleGetPayload<{ include: typeof ruleInclude }>;
type ConditionRow = RuleRow["conditions"][number];
type ActionRow = RuleRow["actions"][number];

/**
 * Maps a stored rule to its API shape. Conditions and actions whose stored field, operator or type is no longer
 * valid are dropped rather than returned with a cast. Writes are validated, so this only matters for stale rows.
 */
export function toRuleResponse(row: RuleRow): IRule {
    return {
        id: row.id,
        name: row.name,
        priority: row.priority,
        stopOnMatch: row.stopOnMatch,
        isActive: row.isActive,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
        conditions: row.conditions.flatMap(toCondition),
        actions: row.actions.flatMap(toAction),
    };
}

/** The rule as the matcher sees it, or null when it is inactive and must not run. */
export function toMatchableRule(row: RuleRow): MatchableRule | null {
    if (!row.isActive) return null;
    const rule = toRuleResponse(row);
    return {
        id: rule.id,
        stopOnMatch: rule.stopOnMatch,
        conditions: rule.conditions,
        actions: rule.actions,
    };
}

/** The user's live, active rules in run order, as the matcher sees them. Load once per run, then reuse. */
export async function loadMatchableRules(db: Db, userId: string): Promise<MatchableRule[]> {
    const rows = await db.rule.findMany({
        where: { userId, isActive: true, deletedAt: null },
        include: ruleInclude,
        orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
    });
    return rows.flatMap((row) => {
        const rule = toMatchableRule(row);
        return rule ? [rule] : [];
    });
}

function toCondition(row: ConditionRow): IRuleCondition[] {
    if (!isRuleConditionField(row.field) || !isRuleOperator(row.operator)) return [];
    if (!isOperatorForField(row.field, row.operator)) return [];
    return [
        {
            id: row.id,
            field: row.field,
            operator: row.operator,
            value: row.value,
            position: row.position,
        },
    ];
}

function toAction(row: ActionRow): IRuleAction[] {
    if (!isRuleActionType(row.type)) return [];
    return [{ id: row.id, type: row.type, value: row.value, position: row.position }];
}
