import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { McpInsufficientScopeException, McpUnauthorizedException } from "./mcp-auth.exceptions";
import type { McpRequest } from "./mcp-request.types";

@Injectable()
export class McpRequireAuthGuard implements CanActivate {
    canActivate(context: ExecutionContext): boolean {
        const req = context.switchToHttp().getRequest<McpRequest>();
        if (!req.mcpAuth) throw new McpUnauthorizedException(req.mcpAuthError ?? "missing");
        if (!req.mcpAuth.scopes.includes("read")) throw new McpInsufficientScopeException();
        return true;
    }
}
