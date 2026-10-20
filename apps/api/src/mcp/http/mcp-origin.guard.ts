import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import type { Request } from "express";
import { getAllowedOrigins } from "../../config/cors";

const LOOPBACK_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

/**
 * DNS-rebinding defense in depth for the MCP endpoint. Bearer auth is the real gate.
 * Requests without an Origin (native/server clients: claude.ai backend, Claude Code, curl) pass.
 * Browser requests must come from an app origin or a loopback origin (MCP Inspector UI).
 */
@Injectable()
export class McpOriginGuard implements CanActivate {
    canActivate(context: ExecutionContext): boolean {
        const origin = context.switchToHttp().getRequest<Request>().headers.origin;
        if (!origin) return true;
        if (LOOPBACK_ORIGIN.test(origin)) return true;
        const allowed = getAllowedOrigins().some((o) => (typeof o === "string" ? o === origin : o.test(origin)));
        if (allowed) return true;
        throw new ForbiddenException("Origin not allowed");
    }
}
