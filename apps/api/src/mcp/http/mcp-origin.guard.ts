import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import type { Request } from "express";
import { getAllowedOrigins } from "../../config/cors";

const LOOPBACK_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;
/** Claude's connector UI sends these; a 403 there hides the 401 challenge, so Claude can't find the OAuth flow. */
const MCP_CLIENT_ORIGINS = new Set(["https://claude.ai", "https://claude.com"]);

/**
 * DNS-rebinding defense in depth for the MCP endpoint. Bearer auth is the real gate.
 * Requests without an Origin (native/server clients: claude.ai backend, Claude Code, curl) pass.
 * Browser requests must come from an app origin, a known MCP client (Claude) or a loopback origin (MCP Inspector UI).
 */
@Injectable()
export class McpOriginGuard implements CanActivate {
    canActivate(context: ExecutionContext): boolean {
        const origin = context.switchToHttp().getRequest<Request>().headers.origin;
        if (!origin) return true;
        if (LOOPBACK_ORIGIN.test(origin) || MCP_CLIENT_ORIGINS.has(origin)) return true;
        const allowed = getAllowedOrigins().some((o) => (typeof o === "string" ? o === origin : o.test(origin)));
        if (allowed) return true;
        throw new ForbiddenException("Origin not allowed");
    }
}
