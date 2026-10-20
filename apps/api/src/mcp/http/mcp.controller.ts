import { Controller, Delete, Get, Logger, Post, Req, Res, UseFilters, UseGuards } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { NodeStreamableHTTPServerTransport } from "@modelcontextprotocol/node";
import type { Response } from "express";
import { createMcpServer } from "../mcp-server.factory";
import { ToolRegistry } from "../tools/tool-registry";
import { McpAuthExceptionFilter } from "./mcp-auth.exception-filter";
import { McpAuthenticateGuard } from "./mcp-authenticate.guard";
import { McpOriginGuard } from "./mcp-origin.guard";
import type { McpRequest } from "./mcp-request.types";
import { McpRequireAuthGuard } from "./mcp-require-auth.guard";
import { McpThrottlerGuard } from "./mcp-throttler.guard";

const METHOD_NOT_ALLOWED = {
    jsonrpc: "2.0",
    error: { code: -32000, message: "Method not allowed. This server is stateless; use POST." },
    id: null,
};

/** Stateless MCP over Streamable HTTP: one server + transport per request, bound to the token's user. */
@ApiTags("mcp")
@Controller("mcp")
@UseFilters(McpAuthExceptionFilter)
@UseGuards(McpOriginGuard, McpAuthenticateGuard, McpThrottlerGuard, McpRequireAuthGuard)
@Throttle({ default: { limit: 120, ttl: 60_000 } })
export class McpController {
    private readonly logger = new Logger(McpController.name);

    constructor(private readonly registry: ToolRegistry) {}

    // The body is read untyped from `req` (no DTO) so the global ValidationPipe cannot strip JSON-RPC.
    @Post()
    @ApiOperation({
        summary: "MCP server (JSON-RPC over Streamable HTTP). Requires an OAuth bearer token issued by /api/v1/oauth.",
    })
    async handle(@Req() req: McpRequest, @Res() res: Response): Promise<void> {
        // Batching was removed from MCP (2025-06-18) and would multiply tool calls per throttled request.
        if (Array.isArray(req.body)) {
            res.status(400).json({
                jsonrpc: "2.0",
                error: { code: -32600, message: "Invalid Request: JSON-RPC batches are not supported." },
                id: null,
            });
            return;
        }
        const server = createMcpServer(this.registry, req.mcpAuth!.userId);
        const transport = new NodeStreamableHTTPServerTransport({
            sessionIdGenerator: undefined,
            enableJsonResponse: true,
        });
        res.on("close", () => {
            void transport.close();
            void server.close();
        });
        try {
            await server.connect(transport);
            await transport.handleRequest(req, res, req.body);
        } catch (err) {
            this.logger.error(
                err instanceof Error
                    ? `MCP request failed: ${err.name}: ${err.message}`
                    : "MCP request failed: UnknownError",
                err instanceof Error ? err.stack : undefined,
            );
            if (!res.headersSent) {
                res.status(500).json({
                    jsonrpc: "2.0",
                    error: { code: -32603, message: "Internal server error" },
                    id: null,
                });
            }
        }
    }

    @Get()
    @ApiOperation({ summary: "Not supported (stateless server); use POST." })
    rejectGet(@Res() res: Response): void {
        res.status(405).set("Allow", "POST").json(METHOD_NOT_ALLOWED);
    }

    @Delete()
    @ApiOperation({ summary: "Not supported (stateless server); use POST." })
    rejectDelete(@Res() res: Response): void {
        res.status(405).set("Allow", "POST").json(METHOD_NOT_ALLOWED);
    }
}
