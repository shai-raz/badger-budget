import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { z } from "zod";
import { MCP_TOOLS, McpToolDefinition, ToolCallResult, ToolInputError } from "./tool.types";

@Injectable()
export class ToolRegistry {
    private readonly logger = new Logger(ToolRegistry.name);
    private readonly tools = new Map<string, McpToolDefinition>();

    constructor(@Inject(MCP_TOOLS) tools: McpToolDefinition[]) {
        for (const tool of tools) {
            if (this.tools.has(tool.name)) {
                throw new Error(`Duplicate MCP tool name: ${tool.name}`);
            }
            this.tools.set(tool.name, tool);
        }
    }

    list(): McpToolDefinition[] {
        return [...this.tools.values()];
    }

    get(name: string): McpToolDefinition | undefined {
        return this.tools.get(name);
    }

    async execute(name: string, userId: string, rawInput: unknown): Promise<ToolCallResult> {
        const tool = this.tools.get(name);
        if (!tool) {
            return { ok: false, error: `Unknown tool: ${name}` };
        }

        const parsed = tool.inputSchema.safeParse(rawInput ?? {});
        if (!parsed.success) {
            // Issue messages only; never echo the raw input.
            return { ok: false, error: `Invalid input for ${name}: ${z.prettifyError(parsed.error)}` };
        }

        try {
            const data = await tool.execute(userId, parsed.data);
            return { ok: true, data };
        } catch (err) {
            if (
                err instanceof ToolInputError ||
                err instanceof NotFoundException ||
                err instanceof BadRequestException
            ) {
                return { ok: false, error: err.message };
            }
            this.logger.error(
                `Tool ${name} failed: ${err instanceof Error ? `${err.name}: ${err.message}` : typeof err}`,
                err instanceof Error ? err.stack : undefined,
            );
            return { ok: false, error: `Internal error while running ${name}` };
        }
    }
}
