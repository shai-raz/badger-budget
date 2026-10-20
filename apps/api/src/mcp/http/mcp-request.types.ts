import type { Request } from "express";
import type { McpAuthContext } from "../../oauth/oauth-tokens.service";

/** Mirrors the MCP SDK `AuthInfo` shape, so it can be passed to the transport as `req.auth`. */
export interface McpAuthInfo {
    token: string;
    clientId: string;
    scopes: string[];
    /** Seconds since epoch. */
    expiresAt: number;
    resource: URL;
    extra: { userId: string; grantId: string };
}

/** `missing`: no bearer token was sent. `invalid_token`: a bearer token was sent but is not valid. */
export type McpAuthError = "missing" | "invalid_token";

export type McpRequest = Request & {
    auth?: McpAuthInfo;
    mcpAuth?: McpAuthContext;
    mcpAuthError?: McpAuthError;
};
