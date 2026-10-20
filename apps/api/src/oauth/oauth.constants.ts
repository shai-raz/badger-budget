export const OAUTH_SCOPE_READ = "read";
export const SUPPORTED_SCOPES = [OAUTH_SCOPE_READ];

export const ACCESS_TOKEN_TTL_SEC = 3600;
export const REFRESH_TOKEN_TTL_MS = 60 * 24 * 60 * 60 * 1000;
export const AUTH_CODE_TTL_MS = 5 * 60 * 1000;
export const AUTH_REQUEST_TTL_MS = 10 * 60 * 1000;
/** Window after rotation in which the old refresh token may be replayed once (lost-response retry). */
export const REFRESH_GRACE_MS = 30_000;
/** Minimum interval between `lastUsedAt` writes for a token/grant/client. */
export const LAST_USED_WRITE_INTERVAL_MS = 60_000;

export const DCR_MAX_REDIRECT_URIS = 5;
export const DCR_MAX_URI_LENGTH = 512;
export const CLIENT_NAME_MAX = 100;
export const UNUSED_CLIENT_PRUNE_DAYS = 7;

export const KNOWN_CLAUDE_REDIRECTS = [
    "https://claude.ai/api/mcp/auth_callback",
    "https://claude.com/api/mcp/auth_callback",
];
export const ALLOWED_PRIVATE_SCHEMES = ["cursor:"];
