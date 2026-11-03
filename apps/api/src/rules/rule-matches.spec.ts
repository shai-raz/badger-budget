import type { PrismaService } from "../prisma/prisma.service";
import {
    comparePreviewOrder,
    loadRuleCandidates,
    matchesPreviewFilter,
    partitionMatches,
    previewTotalPages,
    selectApplyIds,
    RuleCandidate,
} from "./rule-matches";

const USER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ACCOUNT_ID = "44444444-4444-4444-8444-444444444444";
const TARGET_ID = "55555555-5555-4555-8555-555555555555";
const OTHER_ID = "77777777-7777-4777-8777-777777777777";

function candidate(overrides: Partial<RuleCandidate> = {}): RuleCandidate {
    return {
        id: "11111111-1111-4111-8111-111111111111",
        description: "Starbucks",
        originalCategory: null,
        amount: -12.5,
        accountId: ACCOUNT_ID,
        type: "expense",
        categoryId: null,
        transactionDate: new Date("2026-02-01T00:00:00.000Z"),
        createdAt: new Date("2026-02-01T10:00:00.000Z"),
        ...overrides,
    };
}

const draft = {
    conditions: [{ field: "description" as const, operator: "contains" as const, value: "starbucks" }],
    actions: [{ type: "set_category" as const, value: TARGET_ID }],
};

describe("loadRuleCandidates", () => {
    it("reads live, non-mirror rows of the user, including hidden ones", async () => {
        const findMany = jest.fn().mockResolvedValue([]);
        await loadRuleCandidates({ transaction: { findMany } } as unknown as PrismaService, USER_ID);

        expect(findMany).toHaveBeenCalledWith(
            expect.objectContaining({ where: { userId: USER_ID, deletedAt: null, counterpartOfId: null } }),
        );
        expect(findMany.mock.calls[0][0].where).not.toHaveProperty("hidden");
    });

    it("maps amounts to numbers and skips rows whose stored type is not a transaction type", async () => {
        const findMany = jest.fn().mockResolvedValue([
            {
                id: "a",
                description: "Shop",
                originalCategory: "Food",
                amount: "-80.00",
                accountId: ACCOUNT_ID,
                type: "expense",
                categoryId: null,
                transactionDate: new Date("2026-02-01T00:00:00.000Z"),
                createdAt: new Date("2026-02-01T00:00:00.000Z"),
            },
            { id: "b", description: "Odd", amount: "1.00", type: "bogus" },
        ]);

        const rows = await loadRuleCandidates({ transaction: { findMany } } as unknown as PrismaService, USER_ID);

        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ id: "a", amount: -80, originalCategory: "Food", type: "expense" });
    });
});

describe("partitionMatches", () => {
    it("splits matched rows into would-change and already-target, and ignores rows that do not match", () => {
        const rows = [
            candidate({ id: "uncategorized", categoryId: null }),
            candidate({ id: "other", categoryId: OTHER_ID }),
            candidate({ id: "target", categoryId: TARGET_ID }),
            candidate({ id: "miss", description: "Shell", categoryId: null }),
        ];

        const result = partitionMatches(rows, draft);

        expect(result.target).toBe(TARGET_ID);
        expect(result.matched.map((row) => row.id)).toEqual(["uncategorized", "other", "target"]);
        expect(result.wouldChange.map((row) => row.id)).toEqual(["uncategorized", "other"]);
        expect(result.alreadyTarget.map((row) => row.id)).toEqual(["target"]);
    });
});

describe("selectApplyIds", () => {
    it("allExcept keeps the would-change ids that are not listed", () => {
        expect(selectApplyIds(["a", "b", "c"], { mode: "allExcept", ids: ["b", "z"] })).toEqual(["a", "c"]);
    });

    it("only keeps the would-change ids that are listed", () => {
        expect(selectApplyIds(["a", "b", "c"], { mode: "only", ids: ["c", "z"] })).toEqual(["c"]);
    });
});

describe("preview helpers", () => {
    it("filters by uncategorized and categorized", () => {
        const uncategorized = candidate({ categoryId: null });
        const categorized = candidate({ categoryId: OTHER_ID });

        expect(matchesPreviewFilter(uncategorized, "all")).toBe(true);
        expect(matchesPreviewFilter(uncategorized, "uncategorized")).toBe(true);
        expect(matchesPreviewFilter(uncategorized, "categorized")).toBe(false);
        expect(matchesPreviewFilter(categorized, "categorized")).toBe(true);
    });

    it("orders by date, then creation time, then id", () => {
        const older = candidate({ id: "b", transactionDate: new Date("2026-01-01T00:00:00.000Z") });
        const sameDayEarlier = candidate({ id: "a", createdAt: new Date("2026-02-01T08:00:00.000Z") });
        const sameDayLater = candidate({ id: "c", createdAt: new Date("2026-02-01T12:00:00.000Z") });

        const ordered = [older, sameDayEarlier, sameDayLater].sort(comparePreviewOrder).map((row) => row.id);

        expect(ordered).toEqual(["c", "a", "b"]);
    });

    it("gives at least one page, and two pages once there are more than fifty rows", () => {
        expect(previewTotalPages(0)).toBe(1);
        expect(previewTotalPages(50)).toBe(1);
        expect(previewTotalPages(51)).toBe(2);
    });
});
