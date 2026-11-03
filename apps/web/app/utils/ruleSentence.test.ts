import type { IRule } from "@badger/types";
import { describe, expect, it } from "vitest";
import { type RuleDisplayContext, ruleMatchesSearch, ruleSentenceParts } from "./ruleSentence";

const ctx: RuleDisplayContext = {
    accountName: (id) => (id === "acc-1" ? "Everyday" : undefined),
    category: (id) => (id === "cat-1" ? { name: "Coffee", color: "#8b5cf6", icon: "pi-coffee" } : undefined),
};

const ruleFixture = (over: Partial<IRule> = {}): IRule =>
    ({
        id: "rule-1",
        name: "Coffee shops",
        priority: 1,
        stopOnMatch: true,
        isActive: true,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        conditions: [{ id: "c-1", field: "description", operator: "contains", value: "starbucks", position: 0 }],
        actions: [{ id: "a-1", type: "set_category", value: "cat-1", position: 0 }],
        ...over,
    }) as IRule;

describe("ruleSentenceParts", () => {
    it("leads the first condition with When and the rest with and", () => {
        const rule = ruleFixture({
            conditions: [
                { id: "c-1", field: "description", operator: "contains", value: "starbucks", position: 0 },
                { id: "c-2", field: "amount", operator: "greaterThan", value: "5", position: 1 },
            ],
        });
        const parts = ruleSentenceParts(rule, ctx);
        expect(parts.conditions.map((c) => c.lead)).toEqual(["When", "and"]);
    });

    it("describes each condition with the shared formatter", () => {
        const rule = ruleFixture({
            conditions: [
                { id: "c-1", field: "description", operator: "contains", value: "starbucks", position: 0 },
                { id: "c-2", field: "amount", operator: "greaterThan", value: "1000", position: 1 },
                { id: "c-3", field: "account", operator: "equals", value: "acc-1", position: 2 },
                { id: "c-4", field: "type", operator: "equals", value: "expense", position: 3 },
            ],
        });
        expect(ruleSentenceParts(rule, ctx).conditions).toEqual([
            { lead: "When", field: "description", operator: "contains", value: "starbucks" },
            { lead: "and", field: "amount", operator: "is more than", value: "1,000.00" },
            { lead: "and", field: "account", operator: "is", value: "Everyday" },
            { lead: "and", field: "type", operator: "is", value: "Expense" },
        ]);
    });

    it("names an account that no longer exists as unknown", () => {
        const rule = ruleFixture({
            conditions: [{ id: "c-1", field: "account", operator: "equals", value: "acc-gone", position: 0 }],
        });
        expect(ruleSentenceParts(rule, ctx).conditions[0]?.value).toBe("Unknown account");
    });

    it("resolves the set_category action to its category", () => {
        expect(ruleSentenceParts(ruleFixture(), ctx).category).toEqual({
            name: "Coffee",
            color: "#8b5cf6",
            icon: "pi-coffee",
        });
    });

    it("returns no category when the action is missing or its target is unknown", () => {
        expect(ruleSentenceParts(ruleFixture({ actions: [] }), ctx).category).toBeNull();
        const unknownTarget = ruleFixture({
            actions: [{ id: "a-1", type: "set_category", value: "cat-x", position: 0 }],
        });
        expect(ruleSentenceParts(unknownTarget, ctx).category).toBeNull();
    });

    it("passes through the stop flag", () => {
        expect(ruleSentenceParts(ruleFixture({ stopOnMatch: true }), ctx).stop).toBe(true);
        expect(ruleSentenceParts(ruleFixture({ stopOnMatch: false }), ctx).stop).toBe(false);
    });
});

describe("ruleMatchesSearch", () => {
    it("matches every rule for an empty or blank query", () => {
        expect(ruleMatchesSearch(ruleFixture(), "", ctx)).toBe(true);
        expect(ruleMatchesSearch(ruleFixture(), "   ", ctx)).toBe(true);
    });

    it("matches the rule name case-insensitively", () => {
        expect(ruleMatchesSearch(ruleFixture(), "COFFEE SHOPS", ctx)).toBe(true);
    });

    it("matches condition values, including account and type by their names", () => {
        const rule = ruleFixture({
            conditions: [
                { id: "c-1", field: "account", operator: "equals", value: "acc-1", position: 0 },
                { id: "c-2", field: "type", operator: "equals", value: "expense", position: 1 },
            ],
        });
        expect(ruleMatchesSearch(rule, "everyday", ctx)).toBe(true);
        expect(ruleMatchesSearch(rule, "expense", ctx)).toBe(true);
        expect(ruleMatchesSearch(rule, "acc-1", ctx)).toBe(false);
    });

    it("matches the category name", () => {
        expect(ruleMatchesSearch(ruleFixture({ name: "Morning" }), "coffee", ctx)).toBe(true);
    });

    it("does not match text that is in none of the searched fields", () => {
        expect(ruleMatchesSearch(ruleFixture(), "groceries", ctx)).toBe(false);
    });
});
