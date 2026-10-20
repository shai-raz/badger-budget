import { Injectable } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";
import type { McpRequest } from "./mcp-request.types";

/** Throttles per user when authenticated (run after `McpAuthenticateGuard`; new grants must not add budget), per IP otherwise. */
@Injectable()
export class McpThrottlerGuard extends ThrottlerGuard {
    protected async getTracker(req: McpRequest): Promise<string> {
        return req.mcpAuth ? `user:${req.mcpAuth.userId}` : `ip:${req.ip}`;
    }
}
