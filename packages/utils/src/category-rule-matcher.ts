import { matchString } from "./rule-matcher.js";

export interface CategoryMappingRule {
    id: string;
    categoryId: string;
    field: "description" | "originalCategory" | "amount";
    operator: string;
    value: string;
    priority: number;
    stopOnMatch: boolean;
}

export interface TransactionData {
    description: string;
    originalCategory?: string;
    amount?: number;
}

/**
 * Matches a numeric value against a rule using numeric operators
 */
function matchNumber(value: number, operator: string, ruleValue: number): boolean {
    switch (operator) {
        case "greaterThan":
            return value > ruleValue;
        case "lessThan":
            return value < ruleValue;
        case "equals":
            return value === ruleValue;
        default:
            return false;
    }
}

/**
 * Finds the matching category ID for a transaction based on mapping rules
 * Rules are processed in order of priority (ascending), respecting stopOnMatch flag
 *
 * @param transactionData - The transaction data to match against
 * @param rules - Array of category mapping rules (should be pre-sorted by priority)
 * @returns The matching category ID or null if no match found
 */
export function findMatchingCategoryId(transactionData: TransactionData, rules: CategoryMappingRule[]): string | null {
    for (const rule of rules) {
        let matches = false;

        switch (rule.field) {
            case "description":
                matches = matchString(transactionData.description, rule.operator, rule.value);
                break;
            case "originalCategory":
                if (transactionData.originalCategory) {
                    matches = matchString(transactionData.originalCategory, rule.operator, rule.value);
                }
                break;
            case "amount":
                if (transactionData.amount !== undefined) {
                    matches = matchNumber(transactionData.amount, rule.operator, parseFloat(rule.value));
                }
                break;
        }

        if (matches) {
            if (rule.stopOnMatch) {
                return rule.categoryId;
            }
            return rule.categoryId;
        }
    }

    return null;
}
