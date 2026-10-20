import type { ColumnarResult } from "./columnar";
import { ListAccountsTool } from "./list-accounts.tool";
import { ToolRegistry } from "./tool-registry";

describe("ListAccountsTool", () => {
    const row = {
        id: "a1",
        name: "Checking",
        type: "bank",
        userId: "secret-user-id",
        accountNumber: "1234567890",
        externalId: "ext-123",
        password: "hunter2",
        encryptedCredentials: "enc-blob",
        currency: { id: "c1", code: "ILS", symbol: "₪" },
        balance: 100.5,
        balanceKind: "account_balance",
        balanceDate: new Date("2026-03-04T10:00:00Z"),
        cardFrame: null,
        cardIssuer: null,
    };
    const findAll = jest.fn();
    const tool = new ListAccountsTool({ findAll } as never);

    beforeEach(() => findAll.mockReset().mockResolvedValue([row]));

    it("returns exact columns and rows, calling the service with the caller's userId", async () => {
        const out = (await tool.execute("user-1")) as ColumnarResult;
        expect(findAll).toHaveBeenCalledWith("user-1");
        expect(out.columns).toEqual([
            "id",
            "name",
            "type",
            "currency",
            "balance",
            "balanceKind",
            "balanceDate",
            "cardFrame",
            "cardIssuer",
            "accountNumberMasked",
        ]);
        expect(out.rows).toEqual([
            ["a1", "Checking", "bank", "ILS", 100.5, "account_balance", "2026-03-04", null, null, "****7890"],
        ]);
        expect(out.rowCount).toBe(1);
    });

    it("passes a computed cash_on_hand balance through", async () => {
        findAll.mockResolvedValue([
            { ...row, id: "c1", name: "Wallet", type: "cash", balance: 56.6, balanceKind: "cash_on_hand" },
        ]);
        const out = (await tool.execute("user-1")) as ColumnarResult;
        expect(out.rows[0][4]).toBe(56.6);
        expect(out.rows[0][5]).toBe("cash_on_hand");
        expect(tool.description).toMatch(/cash_on_hand/);
    });

    it("handles a missing currency", async () => {
        findAll.mockResolvedValue([{ ...row, currency: null, accountNumber: null, balanceDate: null }]);
        const out = (await tool.execute("user-1")) as ColumnarResult;
        expect(out.rows[0][3]).toBeNull();
        expect(out.rows[0][6]).toBeNull();
        expect(out.rows[0][9]).toBeNull();
    });

    it("rejects extra fields including userId", () => {
        expect(tool.inputSchema.safeParse({ userId: "other" }).success).toBe(false);
        expect(tool.inputSchema.safeParse({}).success).toBe(true);
    });

    it("does not leak sensitive fields", async () => {
        const json = JSON.stringify(await tool.execute("user-1"));
        for (const s of [
            "userId",
            "secret-user-id",
            "1234567890",
            "externalId",
            "ext-123",
            "password",
            "hunter2",
            "encrypted",
            "enc-blob",
        ]) {
            expect(json).not.toContain(s);
        }
        expect(json).toContain("****7890");
    });

    it("explains balance semantics in the description", () => {
        expect(tool.description).toMatch(/balanceKind/);
        expect(tool.description).toMatch(/utilized_credit/);
        expect(tool.description).toMatch(/cardFrame/);
    });

    it("works through the registry", async () => {
        const reg = new ToolRegistry([tool]);
        const res = await reg.execute("list_accounts", "user-1", {});
        expect(res.ok).toBe(true);
    });
});
