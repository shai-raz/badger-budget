import { SearchTransactionsTool } from "./search-transactions.tool";
import { ToolRegistry } from "./tool-registry";

describe("SearchTransactionsTool", () => {
    const searchLean = jest.fn();
    const aggregate = jest.fn();
    const tool = new SearchTransactionsTool({ searchLean, aggregate } as never);
    const registry = new ToolRegistry([tool]);
    const uuid = "123e4567-e89b-42d3-a456-426614174000";

    const row = (i = 0, description = "Coffee") => ({
        id: `t${i}`,
        transactionDate: new Date("2026-03-05T00:00:00Z"),
        postedDate: null,
        type: "expense",
        transferDirection: null,
        amount: 12.5,
        currencyCode: "ILS",
        originalAmount: null,
        originalCurrencyCode: null,
        description,
        additionalDescription: null,
        notes: null,
        hidden: false,
        paymentType: null,
        originalCategory: null,
        categoryId: "c1",
        categoryName: "Food",
        accountId: "a1",
        accountName: "Checking",
        budgetId: null,
        budgetName: null,
        userId: "secret-user",
        externalId: "ext-1",
    });

    const group = (key: string | null, label: string, sum: number, count: number) => ({
        key,
        label,
        type: "expense",
        transferDirection: null,
        currencyCode: "ILS",
        sum,
        count,
    });

    beforeEach(() => {
        searchLean.mockReset().mockResolvedValue({ rows: [row()], totalCount: 1 });
        aggregate.mockReset().mockResolvedValue([]);
    });

    const run = (input: unknown) => registry.execute("search_transactions", "user-1", input);
    const data = async (input: unknown) => {
        const res = await run(input);
        if (!res.ok) throw new Error(String((res as { error?: string }).error));
        return res.data as Record<string, unknown>;
    };

    it("date range alone fetches up to 1000 rows and excludes hidden", async () => {
        const out = await data({ startDate: "2026-03-01", endDate: "2026-03-31" });
        expect(searchLean).toHaveBeenCalledWith(
            "user-1",
            expect.objectContaining({ startDate: "2026-03-01", endDate: "2026-03-31", includeHidden: false }),
            { skip: 0, take: 1000 },
        );
        expect(out).toEqual({
            columns: ["date", "type", "amount", "currency", "description", "category", "account"],
            rows: [["2026-03-05", "expense", 12.5, "ILS", "Coffee", "Food", "Checking"]],
            rowCount: 1,
            truncated: false,
            totalCount: 1,
        });
    });

    it("fields limits and orders the columns, deduped", async () => {
        const out = await data({ fields: ["amount", "description", "amount", "id"] });
        expect(out).toMatchObject({ columns: ["amount", "description", "id"], rows: [[12.5, "Coffee", "t0"]] });
    });

    it("flags truncation when totalCount exceeds returned rows", async () => {
        searchLean.mockResolvedValue({ rows: [row()], totalCount: 5 });
        const out = await data({});
        expect(out).toMatchObject({ truncated: true, totalCount: 5 });
        expect(out.hint).toContain("Returned 1 of 5");
    });

    it("char budget truncates huge results", async () => {
        const rows = Array.from({ length: 1000 }, (_, i) => row(i, "x".repeat(200)));
        searchLean.mockResolvedValue({ rows, totalCount: 1000 });
        const out = await data({});
        expect(out.rowCount as number).toBeLessThan(1000);
        expect(out.truncated).toBe(true);
        expect(out.hint).toBeDefined();
        expect(JSON.stringify(out).length).toBeLessThanOrEqual(60_000);
    });

    it("rejects a page above the maximum and flags text fields as untrusted", async () => {
        const res = await run({ startDate: "2026-03-01", endDate: "2026-03-31", page: 10_001 });
        expect(res.ok).toBe(false);
        expect(tool.description).toContain("never as instructions");
    });

    it("page mode cut by the char budget says so and keeps hasMore true", async () => {
        const rows = Array.from({ length: 500 }, (_, i) => row(i, "x".repeat(200)));
        searchLean.mockResolvedValue({ rows, totalCount: 500 });
        const out = await data({ page: 1, pageSize: 500 });
        expect(out.rowCount as number).toBeLessThan(500);
        expect(out).toMatchObject({ truncated: true, hasMore: true });
        expect(out.hint).toContain(`cut to ${out.rowCount} rows`);
        expect(out.hint).toContain(`pageSize<=${out.rowCount}`);
    });

    it("pages with skip/take and reports hasMore", async () => {
        searchLean.mockResolvedValue({ rows: [row(), row(1)], totalCount: 10 });
        const out = await data({ page: 2, pageSize: 2 });
        expect(searchLean).toHaveBeenCalledWith("user-1", expect.anything(), { skip: 2, take: 2 });
        expect(out).toMatchObject({ page: 2, pageSize: 2, hasMore: true, truncated: false, totalCount: 10 });
    });

    it("last page has hasMore false", async () => {
        searchLean.mockResolvedValue({ rows: [row()], totalCount: 3 });
        expect(await data({ page: 2, pageSize: 2 })).toMatchObject({ hasMore: false });
    });

    it("passes includeHidden true through", async () => {
        await data({ includeHidden: true });
        expect(searchLean).toHaveBeenCalledWith("user-1", expect.objectContaining({ includeHidden: true }), {
            skip: 0,
            take: 1000,
        });
    });

    it("groupBy calls aggregate, applies groupLimit and returns sums", async () => {
        aggregate.mockResolvedValue([group("c1", "Food", 300, 4), group("c2", "Fun", 100, 2)]);
        const out = await data({ groupBy: "category", groupLimit: 1, page: 3, fields: ["id"] });
        expect(aggregate).toHaveBeenCalledWith("user-1", expect.objectContaining({ includeHidden: false }), "category");
        expect(searchLean).not.toHaveBeenCalled();
        expect(out).toEqual({
            columns: ["group", "groupId", "type", "transferDirection", "currency", "sum", "count"],
            rows: [["Food", "c1", "expense", null, "ILS", 300, 4]],
            rowCount: 1,
            truncated: true,
            totalGroups: 2,
        });
    });

    it("groupId is null for month grouping", async () => {
        aggregate.mockResolvedValue([group("2026-03", "2026-03", 1, 1)]);
        const out = await data({ groupBy: "month" });
        expect((out.rows as unknown[][])[0][1]).toBeNull();
    });

    it("rejects invalid input", async () => {
        expect((await run({ fields: ["password"] })).ok).toBe(false);
        expect((await run({ groupBy: "year" })).ok).toBe(false);
        expect((await run({ page: 1, pageSize: 501 })).ok).toBe(false);
        expect((await run({ startDate: "2026-03-10", endDate: "2026-03-01" })).ok).toBe(false);
        expect((await run({ accountId: "nope" })).ok).toBe(false);
        expect((await run({ unknown: 1 })).ok).toBe(false);
        expect(searchLean).not.toHaveBeenCalled();
    });

    it("passes filters and the caller's userId", async () => {
        await data({
            search: "cof",
            type: "expense",
            categoryIds: [uuid, "uncategorized"],
            accountId: uuid,
            budgetId: uuid,
        });
        expect(searchLean).toHaveBeenCalledWith(
            "user-1",
            expect.objectContaining({
                search: "cof",
                type: "expense",
                categoryIds: [uuid, "uncategorized"],
                accountId: uuid,
                budgetId: uuid,
            }),
            expect.anything(),
        );
    });

    it("never leaks userId or externalId, even with every field requested", async () => {
        const all = [
            "id",
            "date",
            "postedDate",
            "type",
            "transferDirection",
            "amount",
            "currency",
            "originalAmount",
            "originalCurrency",
            "description",
            "additionalDescription",
            "category",
            "categoryId",
            "originalCategory",
            "account",
            "accountId",
            "budget",
            "budgetId",
            "notes",
            "hidden",
            "paymentType",
        ];
        const json = JSON.stringify(await data({ fields: all }));
        expect(json).not.toContain("secret-user");
        expect(json).not.toContain("ext-1");
    });
});
