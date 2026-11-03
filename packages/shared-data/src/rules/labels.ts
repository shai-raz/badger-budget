import type { TransactionType } from "../transactions";
import type { RuleConditionField, RuleOperator } from "./vocabulary";

export const RULE_FIELD_LABELS: Record<RuleConditionField, string> = {
    description: "Description",
    originalCategory: "Original category",
    amount: "Amount",
    account: "Account",
    type: "Type",
};

export const RULE_OPERATOR_LABELS: Record<RuleOperator, string> = {
    contains: "contains",
    equals: "is",
    startsWith: "starts with",
    endsWith: "ends with",
    greaterThan: "is more than",
    lessThan: "is less than",
};

export const TRANSACTION_TYPE_LABELS: Record<TransactionType, string> = {
    income: "Income",
    expense: "Expense",
    transfer: "Transfer",
};
