import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { OAuthTokensService } from "../../oauth/oauth-tokens.service";
import type { McpRequest } from "./mcp-request.types";

const BEARER = /^Bearer\s+(\S+)\s*$/i;

/**
 * Non-throwing: resolves the bearer token into `req.auth` / `req.mcpAuth`, or records why it could not
 * (`req.mcpAuthError`). `McpRequireAuthGuard` enforces it, so throttling can key on the grant first.
 * Never log the token.
 */
@Injectable()
export class McpAuthenticateGuard implements CanActivate {
    constructor(private readonly tokens: OAuthTokensService) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const req = context.switchToHttp().getRequest<McpRequest>();
        const token = BEARER.exec(req.headers.authorization ?? "")?.[1];
        if (!token) {
            req.mcpAuthError = "missing";
            return true;
        }
        const auth = await this.tokens.validateAccessToken(token);
        if (!auth) {
            req.mcpAuthError = "invalid_token";
            return true;
        }
        req.mcpAuth = auth;
        req.auth = {
            token,
            clientId: auth.clientId,
            scopes: auth.scopes,
            expiresAt: Math.floor(auth.expiresAt.getTime() / 1000),
            resource: new URL(auth.resource),
            extra: { userId: auth.userId, grantId: auth.grantId },
        };
        return true;
    }
}
