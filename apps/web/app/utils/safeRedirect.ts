const MAX_REDIRECT_LENGTH = 2048;

/**
 * Returns the value only if it is a safe same-origin relative path, else null.
 * Guards against open redirects via protocol-relative, backslash, scheme and control-character tricks.
 */
export function sanitizeRedirectPath(value: unknown): string | null {
    if (typeof value !== "string") return null;
    if (value.length === 0 || value.length > MAX_REDIRECT_LENGTH) return null;
    if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return null;
    if (value.includes("\\")) return null;
    // eslint-disable-next-line no-control-regex
    if (/[\u0000-\u001f\u007f]/.test(value)) return null;
    const firstSlash = value.indexOf("/", 1);
    const firstSegment = firstSlash === -1 ? value : value.slice(0, firstSlash);
    if (firstSegment.includes(":")) return null;
    // Auth pages are never a valid post-login target (prevents wrapped/looping redirects).
    if (/^\/auth(?:[/?#]|$)/i.test(value)) return null;
    return value;
}
