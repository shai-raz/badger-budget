import type { RuleConditionField, RuleOperator } from "@badger/shared-data";
import {
    conditionMatches,
    findMatchingCategoryId,
    type CategoryMappingRule,
    type MatchableCondition,
    type MatchableRule,
    ruleCategoryId,
    ruleMatches,
    type RuleTransaction,
    runRules,
} from "@badger/utils";

const tx: RuleTransaction = {
    description: "Starbucks Coffee",
    originalCategory: "Coffee shops",
    amount: -80,
    accountId: "acc-1",
    type: "expense",
};

function condition(field: RuleConditionField, operator: RuleOperator, value: string): MatchableCondition {
    return { field, operator, value };
}

function rule(
    id: string,
    conditions: MatchableCondition[],
    categoryId: string | null,
    stopOnMatch = false,
): MatchableRule {
    return {
        id,
        stopOnMatch,
        conditions,
        actions: categoryId === null ? [] : [{ type: "set_category", value: categoryId }],
    };
}

describe("conditionMatches", () => {
    it.each<[string, MatchableCondition, boolean]>([
        ["description contains", condition("description", "contains", "BUCKS"), true],
        ["description contains miss", condition("description", "contains", "tea"), false],
        ["description equals", condition("description", "equals", "starbucks coffee"), true],
        ["description equals miss", condition("description", "equals", "starbucks"), false],
        ["description startsWith", condition("description", "startsWith", "STAR"), true],
        ["description startsWith miss", condition("description", "startsWith", "coffee"), false],
        ["description endsWith", condition("description", "endsWith", "coffee"), true],
        ["description endsWith miss", condition("description", "endsWith", "star"), false],
        ["original category contains", condition("originalCategory", "contains", "coffee"), true],
        ["original category equals", condition("originalCategory", "equals", "coffee shops"), true],
        ["original category startsWith", condition("originalCategory", "startsWith", "coffee"), true],
        ["original category endsWith", condition("originalCategory", "endsWith", "shops"), true],
        ["original category equals miss", condition("originalCategory", "equals", "shops"), false],
        ["amount greaterThan", condition("amount", "greaterThan", "50"), true],
        ["amount greaterThan miss", condition("amount", "greaterThan", "100"), false],
        ["amount lessThan", condition("amount", "lessThan", "100"), true],
        ["amount lessThan miss", condition("amount", "lessThan", "50"), false],
        ["amount equals", condition("amount", "equals", "80"), true],
        ["amount equals miss", condition("amount", "equals", "79"), false],
        ["account equals", condition("account", "equals", "acc-1"), true],
        ["account equals miss", condition("account", "equals", "acc-2"), false],
        ["type equals", condition("type", "equals", "expense"), true],
        ["type equals miss", condition("type", "equals", "income"), false],
    ])("%s", (_name, c, expected) => {
        expect(conditionMatches(tx, c)).toBe(expected);
    });
});

describe("conditionMatches edge cases", () => {
    it("never matches an original category condition when the transaction has no category", () => {
        const noCategory = { ...tx, originalCategory: null };
        expect(conditionMatches(noCategory, condition("originalCategory", "contains", ""))).toBe(false);
        expect(conditionMatches(noCategory, condition("originalCategory", "equals", "coffee shops"))).toBe(false);
    });

    it("compares amounts by absolute value, so -80 and +80 both count as 80", () => {
        expect(conditionMatches({ ...tx, amount: 80 }, condition("amount", "greaterThan", "50"))).toBe(true);
        expect(conditionMatches({ ...tx, amount: -80 }, condition("amount", "greaterThan", "50"))).toBe(true);
        expect(conditionMatches({ ...tx, amount: -20 }, condition("amount", "greaterThan", "50"))).toBe(false);
    });

    it("compares amount equality to the cent", () => {
        const twelve = { ...tx, amount: -12.34 };
        expect(conditionMatches(twelve, condition("amount", "equals", "12.34"))).toBe(true);
        expect(conditionMatches(twelve, condition("amount", "equals", "12.340"))).toBe(true);
        expect(conditionMatches(twelve, condition("amount", "equals", "12.35"))).toBe(false);
    });

    it.each(["", "   ", "abc", "Infinity", "NaN"])(
        "never matches an amount against the non-numeric value %j",
        (value) => {
            expect(conditionMatches(tx, condition("amount", "greaterThan", value))).toBe(false);
            expect(conditionMatches(tx, condition("amount", "lessThan", value))).toBe(false);
            expect(conditionMatches(tx, condition("amount", "equals", value))).toBe(false);
        },
    );

    it("never matches an account condition when the transaction has no account", () => {
        expect(conditionMatches({ ...tx, accountId: null }, condition("account", "equals", "acc-1"))).toBe(false);
    });
});

describe("ruleMatches and ruleCategoryId", () => {
    it("requires every condition to match (AND)", () => {
        const both = rule(
            "r1",
            [condition("description", "contains", "starbucks"), condition("amount", "greaterThan", "50")],
            "cat-1",
        );
        expect(ruleMatches(tx, both)).toBe(true);

        const oneFails = rule(
            "r2",
            [condition("description", "contains", "starbucks"), condition("amount", "greaterThan", "100")],
            "cat-1",
        );
        expect(ruleMatches(tx, oneFails)).toBe(false);
    });

    it("never matches a rule with no conditions", () => {
        expect(ruleMatches(tx, rule("r1", [], "cat-1"))).toBe(false);
    });

    it("returns the value of the set_category action, or null when there is none", () => {
        expect(ruleCategoryId(rule("r1", [], "cat-1"))).toBe("cat-1");
        expect(ruleCategoryId(rule("r2", [], null))).toBeNull();
    });
});

describe("runRules", () => {
    const first = rule("first", [condition("type", "equals", "expense")], "cat-a");
    const second = rule("second", [condition("description", "contains", "starbucks")], "cat-b");
    const neverMatches = rule("never", [condition("type", "equals", "income")], "cat-c");

    it("lets the last matching rule win and records every match", () => {
        expect(runRules(tx, [first, second, neverMatches])).toEqual({
            categoryId: "cat-b",
            matchedRuleIds: ["first", "second"],
        });
    });

    it("stops after a rule with stopOnMatch", () => {
        const stopping = { ...first, stopOnMatch: true };
        expect(runRules(tx, [stopping, second])).toEqual({ categoryId: "cat-a", matchedRuleIds: ["first"] });
    });

    it("returns no category and no matches when nothing matches", () => {
        expect(runRules(tx, [neverMatches])).toEqual({ categoryId: null, matchedRuleIds: [] });
    });
});

describe("parity with the legacy category mapping matcher", () => {
    // The legacy matcher compares the raw amount, so amount cases use positive values. Each case is a single
    // rule with stopOnMatch, so first match and last match agree.
    type LegacyCase = [string, RuleTransaction, CategoryMappingRule["field"], RuleOperator, string, boolean];
    const cases: LegacyCase[] = [
        ["description contains", { ...tx, amount: 12 }, "description", "contains", "STARBUCKS", true],
        ["description equals", { ...tx, amount: 12 }, "description", "equals", "starbucks coffee", true],
        ["description startsWith", { ...tx, amount: 12 }, "description", "startsWith", "star", true],
        ["description endsWith miss", { ...tx, amount: 12 }, "description", "endsWith", "tea", false],
        ["original category contains", { ...tx, amount: 12 }, "originalCategory", "contains", "coffee", true],
        ["original category equals miss", { ...tx, amount: 12 }, "originalCategory", "equals", "coffee", false],
        ["amount greaterThan", { ...tx, amount: 80 }, "amount", "greaterThan", "50", true],
        ["amount lessThan miss", { ...tx, amount: 80 }, "amount", "lessThan", "50", false],
        ["amount equals", { ...tx, amount: 12.5 }, "amount", "equals", "12.5", true],
    ];

    it.each(cases)("%s agrees with findMatchingCategoryId", (_name, data, field, operator, value, matches) => {
        const legacyRule: CategoryMappingRule = {
            id: "legacy",
            categoryId: "cat-1",
            field,
            operator,
            value,
            priority: 1,
            stopOnMatch: true,
        };
        const legacy = findMatchingCategoryId(
            {
                description: data.description,
                originalCategory: data.originalCategory ?? undefined,
                amount: data.amount,
            },
            [legacyRule],
        );
        const next = runRules(data, [rule("legacy", [condition(field, operator, value)], "cat-1", true)]);

        expect(legacy).toBe(matches ? "cat-1" : null);
        expect(next.categoryId).toBe(legacy);
    });
});
