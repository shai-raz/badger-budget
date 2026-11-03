/** Fields a rule condition can test. */
export const RULE_CONDITION_FIELDS = ["description", "originalCategory", "amount", "account", "type"] as const;
export type RuleConditionField = (typeof RULE_CONDITION_FIELDS)[number];

export const RULE_TEXT_OPERATORS = ["contains", "equals", "startsWith", "endsWith"] as const;
export type RuleTextOperator = (typeof RULE_TEXT_OPERATORS)[number];

export const RULE_AMOUNT_OPERATORS = ["greaterThan", "lessThan", "equals"] as const;
export type RuleAmountOperator = (typeof RULE_AMOUNT_OPERATORS)[number];

/** Every operator a condition can use. Which ones apply to which field is in RULE_FIELD_OPERATORS. */
export const RULE_OPERATORS = ["contains", "equals", "startsWith", "endsWith", "greaterThan", "lessThan"] as const;
export type RuleOperator = (typeof RULE_OPERATORS)[number];

/** Operators allowed per field. The first entry is the default operator for that field. */
export const RULE_FIELD_OPERATORS: { readonly [F in RuleConditionField]: readonly RuleOperator[] } = {
    description: RULE_TEXT_OPERATORS,
    originalCategory: RULE_TEXT_OPERATORS,
    amount: RULE_AMOUNT_OPERATORS,
    account: ["equals"],
    type: ["equals"],
};

/** Actions a rule can run on a matching transaction. */
export const RULE_ACTION_TYPES = ["set_category"] as const;
export type RuleActionType = (typeof RULE_ACTION_TYPES)[number];

/** Filters for the transactions a rule preview lists. */
export const RULE_PREVIEW_FILTERS = ["all", "uncategorized", "categorized"] as const;
export type RulePreviewFilter = (typeof RULE_PREVIEW_FILTERS)[number];

/** How a selection of previewed transactions is applied: all except the listed ids, or only the listed ids. */
export const RULE_APPLY_MODES = ["allExcept", "only"] as const;
export type RuleApplyMode = (typeof RULE_APPLY_MODES)[number];

/** What happens to a rule when an account is deleted: one of its conditions is removed, or the rule itself is deleted. */
export const ACCOUNT_RULE_OUTCOMES = ["condition_removed", "rule_deleted"] as const;
export type AccountRuleOutcome = (typeof ACCOUNT_RULE_OUTCOMES)[number];

export const RULE_NAME_MAX_LENGTH = 200;
export const RULE_CONDITION_VALUE_MAX_LENGTH = 500;
export const RULE_PREVIEW_PAGE_SIZE = 50;

export function isRuleConditionField(value: string): value is RuleConditionField {
    return RULE_CONDITION_FIELDS.some((field) => field === value);
}

export function isRuleOperator(value: string): value is RuleOperator {
    return RULE_OPERATORS.some((operator) => operator === value);
}

export function isRuleActionType(value: string): value is RuleActionType {
    return RULE_ACTION_TYPES.some((type) => type === value);
}

/** True when `operator` is allowed for `field`. */
export function isOperatorForField(field: RuleConditionField, operator: RuleOperator): boolean {
    return RULE_FIELD_OPERATORS[field].some((allowed) => allowed === operator);
}
