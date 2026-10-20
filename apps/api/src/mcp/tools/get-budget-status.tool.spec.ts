import type { ColumnarResult } from "./columnar";
import { NotFoundException } from "@nestjs/common";
import { GetBudgetStatusTool } from "./get-budget-status.tool";
import { ToolRegistry } from "./tool-registry";

describe("GetBudgetStatusTool", () => {
    const getAnalytics = jest.fn();
    const getDashboard = jest.fn();
    const tool = new GetBudgetStatusTool({ getAnalytics, getDashboard } as never);
    const registry = new ToolRegistry([tool]);
    const uuid = "123e4567-e89b-42d3-a456-426614174000";

    const analytics = {
        budgetId: uuid,
        budgetName: "Groceries",
        userId: "secret-user",
        amount: 500,
        currencyId: "cur-1",
        currencyDisplay: { code: "ILS", symbol: "₪" },
        categories: [
            { id: "c1", name: "Food", userId: "secret-user", externalId: "ext-cat" },
            { id: "c2", name: "Snacks" },
        ],
        period: "monthly",
        periodStart: new Date("2026-03-01T00:00:00Z"),
        periodEnd: new Date("2026-03-31T23:59:59.999Z"),
        account: {
            id: "acc-1",
            name: "Checking",
            accountNumber: "9876543210",
            balance: { toJSON: () => "1000" },
            password: "hunter2",
            encryptedCredentials: "enc-blob",
        },
        totalSpent: 120,
        remaining: 380,
        percentageUsed: 24,
        transactionCount: 4,
        isOverBudget: false,
        existsInPeriod: true,
    };

    beforeEach(() => {
        getAnalytics.mockReset().mockResolvedValue(analytics);
        getDashboard.mockReset().mockResolvedValue({ budgets: [analytics], totalBudgets: 1, overBudgetCount: 0 });
    });

    const expectedRow = [
        uuid,
        "Groceries",
        "monthly",
        "2026-03-01",
        "2026-03-31",
        500,
        "ILS",
        120,
        380,
        24,
        4,
        false,
        true,
        ["Food", "Snacks"],
        "Checking",
    ];

    it("uses getAnalytics for a budgetId and the caller's userId", async () => {
        const input = tool.inputSchema.parse({ budgetId: uuid, periodOffset: -1 });
        const out = (await tool.execute("user-1", input)) as ColumnarResult;
        expect(getAnalytics).toHaveBeenCalledWith(uuid, "user-1", { periodOffset: -1 });
        expect(getDashboard).not.toHaveBeenCalled();
        expect(out.columns).toHaveLength(15);
        expect(out.rows).toEqual([expectedRow]);
    });

    it("uses getDashboard otherwise, defaulting periodOffset to 0", async () => {
        const out = (await tool.execute("user-1", tool.inputSchema.parse({ period: "monthly" }))) as ColumnarResult;
        expect(getDashboard).toHaveBeenCalledWith("user-1", { period: "monthly", periodOffset: 0 });
        expect(out.rows).toEqual([expectedRow]);
    });

    it("maps a budget with no account or currency to nulls", async () => {
        getDashboard.mockResolvedValue({ budgets: [{ ...analytics, account: null, currencyDisplay: null }] });
        const out = (await tool.execute("user-1", tool.inputSchema.parse({}))) as ColumnarResult;
        expect(out.rows[0][6]).toBeNull();
        expect(out.rows[0][14]).toBeNull();
    });

    it.each([
        ["bad uuid", { budgetId: "not-a-uuid" }],
        ["bad period", { period: "hourly" }],
        ["offset too low", { periodOffset: -121 }],
        ["offset too high", { periodOffset: 13 }],
        ["fractional offset", { periodOffset: 0.5 }],
        ["extra userId", { userId: "other" }],
    ])("rejects %s", (_n, input) => {
        expect(tool.inputSchema.safeParse(input).success).toBe(false);
    });

    it("returns ok:false with the message when the budget is not found", async () => {
        getAnalytics.mockRejectedValue(new NotFoundException("Budget not found"));
        const res = await registry.execute("get_budget_status", "user-2", { budgetId: uuid });
        expect(getAnalytics).toHaveBeenCalledWith(uuid, "user-2", { periodOffset: 0 });
        expect(res).toEqual({ ok: false, error: "Budget not found" });
    });

    it("does not leak the raw account or other extra keys", async () => {
        const json = JSON.stringify(await tool.execute("user-1", tool.inputSchema.parse({ budgetId: uuid })));
        for (const s of [
            "userId",
            "secret-user",
            "9876543210",
            "accountNumber",
            "externalId",
            "ext-cat",
            "password",
            "hunter2",
            "encrypted",
            "enc-blob",
            "1000",
        ]) {
            expect(json).not.toContain(s);
        }
    });
});
