/**
 * RFC 6749 / 7591 / 8707 style error. Codes in use: invalid_request, invalid_client, invalid_grant,
 * unauthorized_client, unsupported_grant_type, invalid_scope, invalid_target, invalid_redirect_uri,
 * invalid_client_metadata, access_denied, server_error.
 */
export class OAuthError extends Error {
    constructor(
        public readonly error: string,
        public readonly description: string,
        public readonly status = 400,
    ) {
        super(`${error}: ${description}`);
    }
}
