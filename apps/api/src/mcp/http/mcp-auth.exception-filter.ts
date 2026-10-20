import { ArgumentsHost, Catch, ExceptionFilter } from "@nestjs/common";
import type { Response } from "express";
import { OAuthConfigService } from "../../oauth/oauth-config.service";
import { McpInsufficientScopeException, McpUnauthorizedException } from "./mcp-auth.exceptions";

type McpAuthException = McpUnauthorizedException | McpInsufficientScopeException;

/** Renders MCP auth failures as 401/403 with an RFC 6750 / RFC 9728 `WWW-Authenticate` challenge. */
@Catch(McpUnauthorizedException, McpInsufficientScopeException)
export class McpAuthExceptionFilter implements ExceptionFilter<McpAuthException> {
    constructor(private readonly config: OAuthConfigService) {}

    catch(exception: McpAuthException, host: ArgumentsHost): void {
        const res = host.switchToHttp().getResponse<Response>();
        const base = `Bearer resource_metadata="${this.config.protectedResourceMetadataUrl}"`;

        if (exception instanceof McpInsufficientScopeException) {
            const description = "The access token does not have the required scope";
            res.status(403)
                .set("WWW-Authenticate", `${base}, error="insufficient_scope", scope="read"`)
                .json({ error: "insufficient_scope", error_description: description });
            return;
        }

        if (exception.reason === "invalid_token") {
            const description = "The access token is invalid or expired";
            res.status(401)
                .set(
                    "WWW-Authenticate",
                    `${base}, scope="read", error="invalid_token", error_description="${description}"`,
                )
                .json({ error: "invalid_token", error_description: description });
            return;
        }

        const description = "Authentication required";
        res.status(401)
            .set("WWW-Authenticate", `${base}, scope="read"`)
            .json({ error: "unauthorized", error_description: description });
    }
}
