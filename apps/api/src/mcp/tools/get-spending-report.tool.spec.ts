import type { ColumnarResult } from "./columnar";
import { BadRequestException } from "@nestjs/common";
import { GetSpendingReportTool } from "./get-spending-report.tool";
import { ToolRegistry } from "./tool-registry";

describe("GetSpendingReportTool", () => {
    const getSpendingReport = jest.fn();
    const tool = new GetSpendingReportTool({ getSpendingReport } as never);
    const registry = new ToolRegistry([tool]);

    const report = {
        startDate: "2026-03-01",
        endDate: "2026-03-31",
        userId: "secret-user",
        currency: { code: "USD", symbol: "$" },
        total: 300,
        transactionCount: 5,
        comparison: {
            startDate: "2026-01-29",
            endDate: "2026-02-28",
            total: 200,
            changePercentage: 50,
            direction: "up",
            internal: "x",
        },
        categories: [
            {
                categoryId: "c1",
                name: "Food",
                color: "#fff",
                icon: "i",
                amount: 200,
                percentage: 66.7,
                transactionCount: 3,
            },
            {
                categoryId: null,
                name: "Uncategorized",
                color: "#000",
                icon: null,
                amount: 100,
                percentage: 33.3,
                transactionCount: 2,
            },
        ],
    };

    beforeEach(() => getSpendingReport.mockReset().mockResolvedValue(report));

    it("maps the report and calls the service with the caller's userId", async () => {
        const out = (await tool.execute(
            "user-1",
            tool.inputSchema.parse({ startDate: "2026-03-01", endDate: "2026-03-31", currency: "USD" }),
        )) as ColumnarResult;
        expect(getSpendingReport).toHaveBeenCalledWith("user-1", {
            startDate: "2026-03-01",
            endDate: "2026-03-31",
            currency: "USD",
        });
        expect(out).toEqual({
            startDate: "2026-03-01",
            endDate: "2026-03-31",
            currency: "USD",
            total: 300,
            transactionCount: 5,
            comparison: {
                startDate: "2026-01-29",
                endDate: "2026-02-28",
                total: 200,
                changePercentage: 50,
                direction: "up",
            },
            categories: {
                columns: ["categoryId", "name", "amount", "percentage", "transactionCount"],
                rows: [
                    ["c1", "Food", 200, 66.7, 3],
                    [null, "Uncategorized", 100, 33.3, 2],
                ],
                rowCount: 2,
                truncated: false,
            },
        });
    });

    it("defaults the currency", async () => {
        await tool.execute("user-1", tool.inputSchema.parse({ startDate: "2026-03-01", endDate: "2026-03-31" }));
        expect(getSpendingReport.mock.calls[0][1].currency).toBe("ILS");
    });

    it.each([
        ["bad date format", { startDate: "2026/03/01", endDate: "2026-03-31" }],
        ["impossible date", { startDate: "2026-02-30", endDate: "2026-03-31" }],
        ["end before start", { startDate: "2026-03-31", endDate: "2026-03-01" }],
        ["lowercase currency", { startDate: "2026-03-01", endDate: "2026-03-31", currency: "usd" }],
        ["long currency", { startDate: "2026-03-01", endDate: "2026-03-31", currency: "USDX" }],
        ["extra userId", { startDate: "2026-03-01", endDate: "2026-03-31", userId: "other" }],
        ["missing endDate", { startDate: "2026-03-01" }],
    ])("rejects %s", (_n, input) => {
        expect(tool.inputSchema.safeParse(input).success).toBe(false);
    });

    it("accepts a single-day range", () => {
        expect(tool.inputSchema.safeParse({ startDate: "2026-03-01", endDate: "2026-03-01" }).success).toBe(true);
    });

    it("passes service BadRequestException messages through the registry", async () => {
        getSpendingReport.mockRejectedValue(new BadRequestException("Unknown currency code: ZZZ"));
        const res = await registry.execute("get_spending_report", "user-1", {
            startDate: "2026-03-01",
            endDate: "2026-03-31",
            currency: "ZZZ",
        });
        expect(res).toEqual({ ok: false, error: "Unknown currency code: ZZZ" });
    });

    it("does not leak extra keys", async () => {
        const json = JSON.stringify(
            await tool.execute("user-1", tool.inputSchema.parse({ startDate: "2026-03-01", endDate: "2026-03-31" })),
        );
        for (const s of ["userId", "secret-user", "internal", "color", "icon"]) {
            expect(json).not.toContain(s);
        }
    });
});
