import {
    RULE_FIELD_LABELS,
    RULE_NAME_MAX_LENGTH,
    RULE_OPERATOR_LABELS,
    TRANSACTION_TYPE_LABELS,
    isTransactionType,
} from "@badger/shared-data";
import type { MatchableCondition } from "./rule-matcher.js";

const amountFormatter = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Formats a numeric rule value with two decimals and thousands separators. Returns the input unchanged when it is not a finite number. */
export function formatRuleAmount(value: string): string {
    if (value.trim() === "") return value;
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return value;
    return amountFormatter.format(numeric);
}

export interface RuleFormatContext {
    accountName?: (id: string) => string | undefined;
}

export interface DescribedCondition {
    field: string;
    operator: string;
    value: string;
}

/** Readable parts of a condition, e.g. { field: "amount", operator: "is more than", value: "1,000.00" }. */
export function describeCondition(condition: MatchableCondition, ctx: RuleFormatContext = {}): DescribedCondition {
    return {
        field: RULE_FIELD_LABELS[condition.field].toLowerCase(),
        operator: RULE_OPERATOR_LABELS[condition.operator],
        value: formatConditionValue(condition, ctx),
    };
}

function formatConditionValue(condition: MatchableCondition, ctx: RuleFormatContext): string {
    switch (condition.field) {
        case "description":
        case "originalCategory":
            return condition.value;
        case "amount":
            return formatRuleAmount(condition.value);
        case "account":
            return ctx.accountName?.(condition.value) ?? "Unknown account";
        case "type":
            return isTransactionType(condition.value) ? TRANSACTION_TYPE_LABELS[condition.value] : condition.value;
    }
}

/** Default name for a rule, built from its first condition, e.g. "Description contains starbucks". Empty when there are no conditions. */
export function autoRuleName(conditions: readonly MatchableCondition[], ctx: RuleFormatContext = {}): string {
    const first = conditions[0];
    if (!first) return "";
    const described = describeCondition(first, ctx);
    const name = `${RULE_FIELD_LABELS[first.field]} ${described.operator} ${described.value}`.trim();
    return Array.from(name).slice(0, RULE_NAME_MAX_LENGTH).join("").trim();
}
