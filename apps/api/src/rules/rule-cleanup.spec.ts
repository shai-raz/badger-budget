import type { RuleActionType, RuleConditionField, RuleOperator } from "@badger/shared-data";
import type { PrismaService } from "../prisma/prisma.service";
import {
    accountRuleUsage,
    countCategoryRules,
    deleteCategoryRules,
    moveCategoryRules,
    removeAccountFromRules,
    ruleSignature,
} from "./rule-cleanup";

const USER = "user-1";
const OTHER_USER = "user-2";
const ACCOUNT = "account-1";
const OTHER_ACCOUNT = "account-2";
const FROM = "category-from";
const TO = "category-to";
const DELETED_AT = new Date("2026-02-01T00:00:00.000Z");

type ConditionSeed = [RuleConditionField, RuleOperator, string];
type ActionSeed = [RuleActionType, string];

interface Seed {
    id: string;
    userId?: string;
    priority?: number;
    deletedAt?: Date;
    conditions: ConditionSeed[];
    actions?: ActionSeed[];
}

type FakeCondition = { id: string; ruleId: string; field: string; operator: string; value: string; position: number };
type FakeAction = { id: string; ruleId: string; type: string; value: string; position: number };
type FakeRule = {
    id: string;
    userId: string;
    name: string;
    priority: number;
    stopOnMatch: boolean;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
    deletedAt: Date | null;
    conditions: FakeCondition[];
    actions: FakeAction[];
};

type Where = {
    userId?: string;
    deletedAt?: null;
    id?: { in: string[] };
    conditions?: { some: Record<string, string> };
    actions?: { some: Record<string, string> };
};

function toFakeRule(seed: Seed, index: number): FakeRule {
    return {
        id: seed.id,
        userId: seed.userId ?? USER,
        name: seed.id,
        priority: seed.priority ?? index + 1,
        stopOnMatch: false,
        isActive: true,
        createdAt: new Date(2026, 0, index + 1),
        updatedAt: new Date(2026, 0, index + 1),
        deletedAt: seed.deletedAt ?? null,
        conditions: seed.conditions.map(([field, operator, value], position) => ({
            id: seed.id + "-c" + position,
            ruleId: seed.id,
            field,
            operator,
            value,
            position,
        })),
        actions: (seed.actions ?? []).map(([type, value], position) => ({
            id: seed.id + "-a" + position,
            ruleId: seed.id,
            type,
            value,
            position,
        })),
    };
}

function fieldsMatch(row: Record<string, unknown>, expected: Record<string, string>): boolean {
    return Object.entries(expected).every(([key, value]) => row[key] === value);
}

function matchesWhere(rule: FakeRule, where: Where): boolean {
    if (where.userId !== undefined && rule.userId !== where.userId) return false;
    if (where.deletedAt === null && rule.deletedAt !== null) return false;
    if (where.id && !where.id.in.includes(rule.id)) return false;
    if (where.conditions && !rule.conditions.some((c) => fieldsMatch(c, where.conditions!.some))) return false;
    if (where.actions && !rule.actions.some((a) => fieldsMatch(a, where.actions!.some))) return false;
    return true;
}

/**
 * In-memory stand-in for the Prisma calls rule-cleanup makes, so the helpers run against real data shapes
 * without a database. It implements only the where clauses the helpers use.
 */
function createDb(seeds: Seed[]) {
    const rules = seeds.map(toFakeRule);
    const live = (where: Where) => rules.filter((rule) => matchesWhere(rule, where));

    const db = {
        rule: {
            findMany: async ({ where }: { where: Where }) =>
                live(where)
                    .map((rule) => ({ ...rule, conditions: [...rule.conditions], actions: [...rule.actions] }))
                    .sort((a, b) => a.priority - b.priority),
            count: async ({ where }: { where: Where }) => live(where).length,
            updateMany: async ({ where, data }: { where: Where; data: { deletedAt: Date } }) => {
                const hit = live(where);
                for (const rule of hit) rule.deletedAt = data.deletedAt;
                return { count: hit.length };
            },
        },
        ruleAction: {
            updateMany: async ({
                where,
                data,
            }: {
                where: { ruleId: { in: string[] }; type: string; value: string };
                data: { value: string };
            }) => {
                let count = 0;
                for (const rule of rules.filter((r) => where.ruleId.in.includes(r.id))) {
                    for (const action of rule.actions) {
                        if (action.type === where.type && action.value === where.value) {
                            action.value = data.value;
                            count++;
                        }
                    }
                }
                return { count };
            },
        },
        ruleCondition: {
            deleteMany: async ({ where }: { where: { ruleId: { in: string[] }; field: string; value: string } }) => {
                for (const rule of rules.filter((r) => where.ruleId.in.includes(r.id))) {
                    rule.conditions = rule.conditions.filter(
                        (c) => !(c.field === where.field && c.value === where.value),
                    );
                }
            },
        },
    };

    const byId = (id: string) => {
        const rule = rules.find((r) => r.id === id);
        if (!rule) throw new Error("no rule " + id);
        return rule;
    };

    return { db: db as unknown as PrismaService, byId };
}

describe("ruleSignature", () => {
    it("ignores the order of conditions and actions", () => {
        const a = {
            conditions: [
                { field: "description" as const, operator: "contains" as const, value: "coffee" },
                { field: "amount" as const, operator: "greaterThan" as const, value: "5" },
            ],
            actions: [{ type: "set_category" as const, value: TO }],
        };
        const b = {
            conditions: [...a.conditions].reverse(),
            actions: [...a.actions],
        };
        expect(ruleSignature(a)).toBe(ruleSignature(b));
    });

    it("differs when a value differs", () => {
        const base = {
            conditions: [{ field: "description" as const, operator: "contains" as const, value: "coffee" }],
            actions: [{ type: "set_category" as const, value: TO }],
        };
        const other = { ...base, conditions: [{ ...base.conditions[0], value: "tea" }] };
        expect(ruleSignature(base)).not.toBe(ruleSignature(other));
    });
});

describe("moveCategoryRules", () => {
    it("keeps a non-duplicate rule and drops a duplicate whose conditions are in a different order", async () => {
        const { db, byId } = createDb([
            {
                id: "target",
                conditions: [
                    ["description", "contains", "coffee"],
                    ["amount", "greaterThan", "5"],
                ],
                actions: [["set_category", TO]],
            },
            {
                id: "duplicate",
                priority: 2,
                conditions: [
                    ["amount", "greaterThan", "5"],
                    ["description", "contains", "coffee"],
                ],
                actions: [["set_category", FROM]],
            },
            {
                id: "keep",
                priority: 3,
                conditions: [["description", "contains", "rent"]],
                actions: [["set_category", FROM]],
            },
        ]);

        await moveCategoryRules(db, USER, FROM, TO);

        expect(byId("duplicate").deletedAt).not.toBeNull();
        expect(byId("keep").deletedAt).toBeNull();
        expect(byId("keep").actions.map((a) => a.value)).toEqual([TO]);
        expect(byId("target").actions.map((a) => a.value)).toEqual([TO]);
    });

    it("keeps one of two identical source rules when the target has none", async () => {
        const { db, byId } = createDb([
            {
                id: "first",
                priority: 1,
                conditions: [["description", "contains", "gym"]],
                actions: [["set_category", FROM]],
            },
            {
                id: "second",
                priority: 2,
                conditions: [["description", "contains", "gym"]],
                actions: [["set_category", FROM]],
            },
        ]);

        await moveCategoryRules(db, USER, FROM, TO);

        expect(byId("first").deletedAt).toBeNull();
        expect(byId("first").actions.map((a) => a.value)).toEqual([TO]);
        expect(byId("second").deletedAt).not.toBeNull();
    });

    it("ignores duplicates that are soft-deleted or belong to another user", async () => {
        const { db, byId } = createDb([
            { id: "source", conditions: [["description", "contains", "gym"]], actions: [["set_category", FROM]] },
            {
                id: "deleted-target",
                deletedAt: DELETED_AT,
                conditions: [["description", "contains", "gym"]],
                actions: [["set_category", TO]],
            },
            {
                id: "foreign-target",
                userId: OTHER_USER,
                conditions: [["description", "contains", "gym"]],
                actions: [["set_category", TO]],
            },
            {
                id: "foreign-source",
                userId: OTHER_USER,
                conditions: [["description", "contains", "tea"]],
                actions: [["set_category", FROM]],
            },
        ]);

        await moveCategoryRules(db, USER, FROM, TO);

        expect(byId("source").deletedAt).toBeNull();
        expect(byId("source").actions.map((a) => a.value)).toEqual([TO]);
        expect(byId("foreign-source").actions.map((a) => a.value)).toEqual([FROM]);
    });
});

describe("deleteCategoryRules and countCategoryRules", () => {
    it("soft-deletes the live rules on the category and leaves the rest alone", async () => {
        const { db, byId } = createDb([
            { id: "on-category", conditions: [["description", "contains", "a"]], actions: [["set_category", FROM]] },
            {
                id: "already-deleted",
                deletedAt: DELETED_AT,
                conditions: [["description", "contains", "b"]],
                actions: [["set_category", FROM]],
            },
            { id: "other-category", conditions: [["description", "contains", "c"]], actions: [["set_category", TO]] },
            { id: "uncategorized", conditions: [["description", "contains", "d"]] },
            {
                id: "foreign",
                userId: OTHER_USER,
                conditions: [["description", "contains", "e"]],
                actions: [["set_category", FROM]],
            },
        ]);

        expect(await countCategoryRules(db, USER, FROM)).toBe(1);
        expect(await deleteCategoryRules(db, USER, FROM)).toBe(1);

        expect(byId("on-category").deletedAt).not.toBeNull();
        expect(byId("already-deleted").deletedAt).toEqual(DELETED_AT);
        expect(byId("other-category").deletedAt).toBeNull();
        expect(byId("uncategorized").deletedAt).toBeNull();
        expect(byId("foreign").deletedAt).toBeNull();
        expect(await countCategoryRules(db, USER, FROM)).toBe(0);
    });
});

/** Shared fixture for the account helpers: one rule of each kind, in a known priority order. */
const accountSeeds: Seed[] = [
    {
        id: "mixed",
        priority: 1,
        conditions: [
            ["description", "contains", "bank"],
            ["account", "equals", ACCOUNT],
        ],
    },
    { id: "only", priority: 2, conditions: [["account", "equals", ACCOUNT]], actions: [["set_category", TO]] },
    { id: "other", priority: 3, conditions: [["account", "equals", OTHER_ACCOUNT]] },
    { id: "deleted", priority: 4, deletedAt: DELETED_AT, conditions: [["account", "equals", ACCOUNT]] },
    { id: "foreign", priority: 5, userId: OTHER_USER, conditions: [["account", "equals", ACCOUNT]] },
];

describe("accountRuleUsage", () => {
    it("lists the live rules on the account in priority order, with the outcome of deleting it", async () => {
        const { db } = createDb(accountSeeds);

        expect(await accountRuleUsage(db, USER, ACCOUNT)).toEqual([
            { id: "mixed", name: "mixed", outcome: "condition_removed" },
            { id: "only", name: "only", outcome: "rule_deleted" },
        ]);
    });
});

describe("removeAccountFromRules", () => {
    it("removes only the account condition from a mixed rule and soft-deletes an account-only rule", async () => {
        const { db, byId } = createDb(accountSeeds);

        await removeAccountFromRules(db, USER, ACCOUNT);

        expect(byId("mixed").deletedAt).toBeNull();
        expect(byId("mixed").conditions.map((c) => [c.field, c.value])).toEqual([["description", "bank"]]);
        expect(byId("only").deletedAt).not.toBeNull();
    });

    it("leaves rules on other accounts, deleted rules and rules of other users untouched", async () => {
        const { db, byId } = createDb(accountSeeds);

        await removeAccountFromRules(db, USER, ACCOUNT);

        expect(byId("other").deletedAt).toBeNull();
        expect(byId("other").conditions).toHaveLength(1);
        expect(byId("deleted").deletedAt).toEqual(DELETED_AT);
        expect(byId("deleted").conditions).toHaveLength(1);
        expect(byId("foreign").deletedAt).toBeNull();
        expect(byId("foreign").conditions).toHaveLength(1);
    });
});
