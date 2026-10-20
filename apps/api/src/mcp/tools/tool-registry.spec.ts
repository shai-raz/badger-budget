import { NotFoundException } from "@nestjs/common";
import { z } from "zod";
import { ToolRegistry } from "./tool-registry";
import { McpToolDefinition } from "./tool.types";

const makeTool = (name: string, execute: McpToolDefinition["execute"]): McpToolDefinition => ({
    name,
    title: name,
    description: "d",
    inputSchema: z.object({ limit: z.number().int().default(10).describe("limit") }).strict(),
    execute,
});

describe("ToolRegistry", () => {
    it("throws on duplicate names", () => {
        const t = makeTool("a", async () => ({}));
        expect(() => new ToolRegistry([t, t])).toThrow(/Duplicate/);
    });

    it("lists and gets tools", () => {
        const t = makeTool("a", async () => ({}));
        const reg = new ToolRegistry([t]);
        expect(reg.list()).toEqual([t]);
        expect(reg.get("a")).toBe(t);
        expect(reg.get("b")).toBeUndefined();
    });

    it("returns error for unknown tool", async () => {
        const reg = new ToolRegistry([]);
        expect(await reg.execute("nope", "u", {})).toEqual({ ok: false, error: "Unknown tool: nope" });
    });

    it("returns validation error without echoing input", async () => {
        const reg = new ToolRegistry([makeTool("a", async () => ({}))]);
        const res = await reg.execute("a", "u", { limit: "SECRET-VALUE" });
        expect(res.ok).toBe(false);
        expect(JSON.stringify(res)).not.toContain("SECRET-VALUE");
    });

    it("maps NotFoundException to its message", async () => {
        const reg = new ToolRegistry([
            makeTool("a", async () => {
                throw new NotFoundException("Account not found");
            }),
        ]);
        expect(await reg.execute("a", "u", {})).toEqual({ ok: false, error: "Account not found" });
    });

    it("maps generic errors to a generic message", async () => {
        const reg = new ToolRegistry([
            makeTool("a", async () => {
                throw new Error("db password leaked");
            }),
        ]);
        const res = await reg.execute("a", "u", {});
        expect(res).toEqual({ ok: false, error: "Internal error while running a" });
    });

    it("passes userId and parsed input with defaults", async () => {
        const exec = jest.fn().mockResolvedValue({ x: 1 });
        const reg = new ToolRegistry([makeTool("a", exec)]);
        const res = await reg.execute("a", "user-1", undefined);
        expect(res).toEqual({ ok: true, data: { x: 1 } });
        expect(exec).toHaveBeenCalledWith("user-1", { limit: 10 });
    });
});
