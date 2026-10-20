import { parseTrustProxyHops } from "./trust-proxy";

describe("parseTrustProxyHops", () => {
    it("defaults to 1 when undefined or empty", () => {
        expect(parseTrustProxyHops(undefined)).toBe(1);
        expect(parseTrustProxyHops("")).toBe(1);
        expect(parseTrustProxyHops("  ")).toBe(1);
    });

    it("parses non-negative integers", () => {
        expect(parseTrustProxyHops("0")).toBe(0);
        expect(parseTrustProxyHops("2")).toBe(2);
    });

    it.each(["-1", "1.5", "abc", "true", "1 2"])("throws on %p", (v) => {
        expect(() => parseTrustProxyHops(v)).toThrow(/TRUST_PROXY_HOPS/);
    });
});
