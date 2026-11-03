import type { PrismaService } from "../prisma/prisma.service";
import { loadMatchableRules, ruleInclude } from "./rule-mapping";

describe("loadMatchableRules", () => {
    const storedRule = (overrides: Record<string, unknown> = {}) => ({
        id: "rule-1",
        userId: "user-1",
        name: "Coffee",
        priority: 1,
        stopOnMatch: false,
        isActive: true,
        createdAt: new Date("2026-01-01"),
        updatedAt: new Date("2026-01-01"),
        deletedAt: null,
        conditions: [{ id: "c1", field: "description", operator: "contains", value: "coffee", position: 0 }],
        actions: [{ id: "a1", type: "set_category", value: "cat-1", position: 0 }],
        ...overrides,
    });

    const dbWith = (rows: unknown[]) => {
        const findMany = jest.fn().mockResolvedValue(rows);
        return { db: { rule: { findMany } } as unknown as PrismaService, findMany };
    };

    it("reads the live, active rules in run order and maps them for the matcher", async () => {
        const { db, findMany } = dbWith([storedRule()]);

        const rules = await loadMatchableRules(db, "user-1");

        expect(findMany).toHaveBeenCalledWith({
            where: { userId: "user-1", isActive: true, deletedAt: null },
            include: ruleInclude,
            orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
        });
        expect(rules).toEqual([
            {
                id: "rule-1",
                stopOnMatch: false,
                conditions: [{ id: "c1", field: "description", operator: "contains", value: "coffee", position: 0 }],
                actions: [{ id: "a1", type: "set_category", value: "cat-1", position: 0 }],
            },
        ]);
    });

    it("drops a returned row that is inactive", async () => {
        const { db } = dbWith([storedRule({ isActive: false })]);

        await expect(loadMatchableRules(db, "user-1")).resolves.toEqual([]);
    });
});
