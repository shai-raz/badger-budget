import { McpAuthError } from "./mcp-request.types";

/** No valid bearer token. Rendered as 401 + WWW-Authenticate by `McpAuthExceptionFilter`. */
export class McpUnauthorizedException extends Error {
    constructor(readonly reason: McpAuthError) {
        super("Unauthorized");
    }
}

/** Valid token without the `read` scope. Rendered as 403 + WWW-Authenticate. */
export class McpInsufficientScopeException extends Error {
    constructor() {
        super("Insufficient scope");
    }
}
