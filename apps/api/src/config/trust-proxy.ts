/**
 * Parses TRUST_PROXY_HOPS: undefined/empty -> 1, a non-negative integer string -> that integer,
 * anything else throws so a misconfiguration fails at boot rather than silently trusting the wrong hops.
 */
export function parseTrustProxyHops(value: string | undefined): number {
    if (value === undefined || value.trim() === "") return 1;
    const trimmed = value.trim();
    if (!/^\d+$/.test(trimmed)) {
        throw new Error(`Invalid TRUST_PROXY_HOPS "${value}": expected a non-negative integer`);
    }
    return parseInt(trimmed, 10);
}
