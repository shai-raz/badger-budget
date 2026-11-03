import type { RuleActionType, RuleConditionField, RuleOperator, TransactionType } from "@badger/shared-data";

/** The transaction fields rules are evaluated against. */
export interface RuleTransaction {
    description: string;
    originalCategory: string | null;
    /** Signed or absolute; amount conditions compare the absolute value. */
    amount: number;
    accountId: string | null;
    type: TransactionType;
}

export interface MatchableCondition {
    field: RuleConditionField;
    operator: RuleOperator;
    value: string;
}

export interface MatchableAction {
    type: RuleActionType;
    value: string;
}

export interface MatchableRule {
    id: string;
    stopOnMatch: boolean;
    conditions: readonly MatchableCondition[];
    actions: readonly MatchableAction[];
}

export interface RuleRunResult {
    categoryId: string | null;
    matchedRuleIds: string[];
}

/**
 * Matches a string value against a rule using a string operator (case-insensitive, e.g. "contains").
 */
export function matchString(value: string, operator: string, ruleValue: string): boolean {
    const lowerValue = value.toLowerCase();
    const lowerRuleValue = ruleValue.toLowerCase();

    switch (operator) {
        case "contains":
            return lowerValue.includes(lowerRuleValue);
        case "equals":
            return lowerValue === lowerRuleValue;
        case "startsWith":
            return lowerValue.startsWith(lowerRuleValue);
        case "endsWith":
            return lowerValue.endsWith(lowerRuleValue);
        default:
            return false;
    }
}

/** Compares the absolute amount with a numeric value. Equality is to the cent. A value that is not a finite number never matches. */
function matchAmount(amount: number, operator: RuleOperator, rawValue: string): boolean {
    if (rawValue.trim() === "") return false;
    const target = Number(rawValue);
    if (!Number.isFinite(target)) return false;

    const absolute = Math.abs(amount);
    switch (operator) {
        case "greaterThan":
            return absolute > target;
        case "lessThan":
            return absolute < target;
        case "equals":
            return Math.round(absolute * 100) === Math.round(target * 100);
        default:
            return false;
    }
}

/** True when the transaction satisfies one condition. */
export function conditionMatches(tx: RuleTransaction, condition: MatchableCondition): boolean {
    switch (condition.field) {
        case "description":
            return matchString(tx.description, condition.operator, condition.value);
        case "originalCategory":
            return (
                tx.originalCategory !== null && matchString(tx.originalCategory, condition.operator, condition.value)
            );
        case "amount":
            return matchAmount(tx.amount, condition.operator, condition.value);
        case "account":
            return tx.accountId === condition.value;
        case "type":
            return tx.type === condition.value;
    }
}

/** True when the rule has at least one condition and every condition matches. */
export function ruleMatches(tx: RuleTransaction, rule: MatchableRule): boolean {
    return rule.conditions.length > 0 && rule.conditions.every((condition) => conditionMatches(tx, condition));
}

/** Category the rule sets: the value of its last set_category action, or null. */
export function ruleCategoryId(rule: MatchableRule): string | null {
    let categoryId: string | null = null;
    for (const action of rule.actions) {
        if (action.type === "set_category") categoryId = action.value;
    }
    return categoryId;
}

/**
 * Runs rules in priority order (the caller sorts them). Every matching rule is recorded; the last
 * matching rule that sets a category wins. A rule with stopOnMatch ends the run.
 */
export function runRules(tx: RuleTransaction, rules: readonly MatchableRule[]): RuleRunResult {
    let categoryId: string | null = null;
    const matchedRuleIds: string[] = [];

    for (const rule of rules) {
        if (!ruleMatches(tx, rule)) continue;
        matchedRuleIds.push(rule.id);
        categoryId = ruleCategoryId(rule) ?? categoryId;
        if (rule.stopOnMatch) break;
    }

    return { categoryId, matchedRuleIds };
}
