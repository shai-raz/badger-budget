import type { IRule } from "@badger/types";
import { describeCondition, ruleCategoryId } from "@badger/utils";

export interface RuleCategoryDisplay {
    name: string;
    color: string;
    icon?: string;
}

/** Looks up the names a rule refers to by id, so the sentence and search show readable text. */
export interface RuleDisplayContext {
    accountName(id: string): string | undefined;
    category(id: string): RuleCategoryDisplay | undefined;
}

export interface RuleSentenceCondition {
    lead: "When" | "and";
    field: string;
    operator: string;
    value: string;
}

export interface RuleSentenceParts {
    conditions: RuleSentenceCondition[];
    category: RuleCategoryDisplay | null;
    stop: boolean;
}

/** The readable pieces of a rule's sentence, e.g. "When description contains starbucks … then set category to Coffee". */
export function ruleSentenceParts(rule: IRule, ctx: RuleDisplayContext): RuleSentenceParts {
    const conditions = rule.conditions.map((condition, index): RuleSentenceCondition => {
        const described = describeCondition(condition, ctx);
        return { lead: index === 0 ? "When" : "and", ...described };
    });

    const categoryId = ruleCategoryId(rule);
    const category = categoryId === null ? null : (ctx.category(categoryId) ?? null);

    return { conditions, category, stop: rule.stopOnMatch };
}

/** Case-insensitive search over the rule name, its condition values and its category name. An empty query matches every rule. */
export function ruleMatchesSearch(rule: IRule, query: string, ctx: RuleDisplayContext): boolean {
    const needle = query.trim().toLowerCase();
    if (needle === "") return true;

    const parts = ruleSentenceParts(rule, ctx);
    const haystack = [rule.name, ...parts.conditions.map((condition) => condition.value), parts.category?.name];
    return haystack.some((text) => text !== undefined && text.toLowerCase().includes(needle));
}
