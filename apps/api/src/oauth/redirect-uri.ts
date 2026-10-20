import { ALLOWED_PRIVATE_SCHEMES, DCR_MAX_URI_LENGTH, KNOWN_CLAUDE_REDIRECTS } from "./oauth.constants";

const LOOPBACK_HOSTS = ["localhost", "127.0.0.1", "[::1]"];

function parse(uri: string): URL | null {
    try {
        return new URL(uri);
    } catch {
        return null;
    }
}

function isLoopbackUrl(url: URL): boolean {
    return url.protocol === "http:" && LOOPBACK_HOSTS.includes(url.hostname);
}

export function isAllowedRedirectUri(uri: string): boolean {
    if (typeof uri !== "string" || uri.length > DCR_MAX_URI_LENGTH || uri.includes("#")) return false;
    const url = parse(uri);
    if (!url) return false;
    if (url.hash || url.username || url.password) return false;
    if (url.protocol === "https:") return url.hostname.length > 0;
    if (url.protocol === "http:") return isLoopbackUrl(url);
    return ALLOWED_PRIVATE_SCHEMES.includes(url.protocol);
}

export function isLoopbackRedirect(uri: string): boolean {
    const url = parse(uri);
    return !!url && isLoopbackUrl(url);
}

/** Exact match, except loopback http redirects ignore the port (RFC 8252 section 7.3). */
export function redirectUriMatches(registered: string, requested: string): boolean {
    if (registered === requested) return true;
    const a = parse(registered);
    const b = parse(requested);
    if (!a || !b || !isLoopbackUrl(a) || !isLoopbackUrl(b)) return false;
    return a.protocol === b.protocol && a.hostname === b.hostname && a.pathname === b.pathname && a.search === b.search;
}

export function isVerifiedClaudeRedirect(uri: string): boolean {
    return KNOWN_CLAUDE_REDIRECTS.includes(uri);
}

export function redirectDisplay(uri: string): string {
    const url = parse(uri);
    if (!url) return uri;
    if (url.protocol === "http:" || url.protocol === "https:") return url.host;
    return `${url.protocol}//${url.host}`;
}
