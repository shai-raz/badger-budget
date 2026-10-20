import type { ColumnarResult } from "./columnar";
import { ListCategoriesTool } from "./list-categories.tool";

describe("ListCategoriesTool", () => {
    const findAll = jest.fn();
    const tool = new ListCategoriesTool({ findAll } as never);

    beforeEach(() =>
        findAll.mockReset().mockResolvedValue([
            { id: "c1", name: "Food", isSystem: true, userId: null, color: "#fff", externalId: "x-1" },
            { id: "c2", name: "Mine", isSystem: false, userId: "secret-user", color: "#000", externalId: "x-2" },
        ]),
    );

    it("returns exact columns and rows with the caller's userId", async () => {
        const out = (await tool.execute("user-1")) as ColumnarResult;
        expect(findAll).toHaveBeenCalledWith("user-1");
        expect(out.columns).toEqual(["id", "name", "isSystem"]);
        expect(out.rows).toEqual([
            ["c1", "Food", true],
            ["c2", "Mine", false],
        ]);
    });

    it("rejects extra fields including userId", () => {
        expect(tool.inputSchema.safeParse({ userId: "other" }).success).toBe(false);
    });

    it("does not leak extra keys", async () => {
        const json = JSON.stringify(await tool.execute("user-1"));
        for (const s of ["userId", "secret-user", "externalId", "x-1", "color"]) {
            expect(json).not.toContain(s);
        }
    });

    it("mentions uncategorized in the description", () => {
        expect(tool.description).toContain("uncategorized");
    });
});
