import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import { NotFoundException } from "@nestjs/common";
import { z } from "zod";
import { createMcpServer, registerTools } from "./mcp-server.factory";
import { ToolRegistry } from "./tools/tool-registry";
import { McpToolDefinition } from "./tools/tool.types";

const okTool: McpToolDefinition = {
    name: "ok_tool",
    title: "Ok tool",
    description: "returns data",
    inputSchema: z.object({ n: z.number().int().describe("a number") }).strict(),
    execute: async (userId, input) => ({ userId, n: input.n, list: [1, 2] }),
};

const failTool: McpToolDefinition = {
    name: "fail_tool",
    title: "Fail tool",
    description: "always not found",
    inputSchema: z.object({}).strict(),
    execute: async () => {
        throw new NotFoundException("Account not found");
    },
};

describe("registerTools", () => {
    const setup = () => {
        const registerTool = jest.fn();
        registerTools({ registerTool } as never, new ToolRegistry([okTool, failTool]), "user-1");
        return registerTool;
    };

    it("registers every tool with read-only annotations", () => {
        const registerTool = setup();
        expect(registerTool.mock.calls.map((c) => c[0])).toEqual(["ok_tool", "fail_tool"]);
        for (const [, config] of registerTool.mock.calls) {
            expect(config.annotations).toEqual({
                readOnlyHint: true,
                destructiveHint: false,
                idempotentHint: true,
                openWorldHint: false,
            });
        }
        expect(registerTool.mock.calls[0][1]).toMatchObject({
            title: "Ok tool",
            description: "returns data",
            inputSchema: okTool.inputSchema,
        });
    });

    it("returns compact JSON text and passes userId through", async () => {
        const handler = setup().mock.calls[0][2];
        const res = await handler({ n: 3 });
        expect(res).toEqual({ content: [{ type: "text", text: '{"userId":"user-1","n":3,"list":[1,2]}' }] });
        expect(res.structuredContent).toBeUndefined();
    });

    it("returns isError text for failures", async () => {
        const handler = setup().mock.calls[1][2];
        expect(await handler({})).toEqual({ content: [{ type: "text", text: "Account not found" }], isError: true });
    });
});

describe("createMcpServer round trip", () => {
    it("lists and calls tools over an in-memory transport", async () => {
        const server = createMcpServer(new ToolRegistry([okTool, failTool]), "user-9");
        const client = new Client({ name: "test", version: "1.0.0" });
        const [clientT, serverT] = InMemoryTransport.createLinkedPair();
        await Promise.all([server.connect(serverT), client.connect(clientT)]);

        const { tools } = await client.listTools();
        expect(tools.map((t) => t.name).sort()).toEqual(["fail_tool", "ok_tool"]);
        expect(tools[0].annotations?.readOnlyHint).toBe(true);

        const ok = await client.callTool({ name: "ok_tool", arguments: { n: 2 } });
        expect(ok.isError).toBeFalsy();
        expect(ok.content).toEqual([{ type: "text", text: '{"userId":"user-9","n":2,"list":[1,2]}' }]);

        const bad = await client.callTool({ name: "fail_tool", arguments: {} });
        expect(bad.isError).toBe(true);

        await client.close();
        await server.close();
    });
});
