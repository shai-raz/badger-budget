import type { z } from "zod";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface McpToolDefinition<S extends z.ZodObject<any> = z.ZodObject<any>> {
    /** snake_case, <= 64 chars */
    readonly name: string;
    readonly title: string;
    /** Written for LLMs: what it returns, units, semantics. No instructions to the model. */
    readonly description: string;
    /** Must be .strict(); every field has .describe(). */
    readonly inputSchema: S;
    /** Returns a JSON-safe plain object. */
    execute(userId: string, input: z.infer<S>): Promise<unknown>;
}

/** Thrown by tools for caller-correctable input problems; the message is shown to the caller. */
export class ToolInputError extends Error {}

export type ToolCallResult = { ok: true; data: unknown } | { ok: false; error: string };

export const MCP_TOOLS = Symbol("MCP_TOOLS");
