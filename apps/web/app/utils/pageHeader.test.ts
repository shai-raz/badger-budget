import { describe, expect, it } from "vitest";
import { canGoBackTo, resolveHeaderLeading } from "./pageHeader";

describe("resolveHeaderLeading", () => {
    it("shows back on child pages at every breakpoint", () => {
        expect(resolveHeaderLeading({ hasParent: true, isDesktop: true })).toBe("back");
        expect(resolveHeaderLeading({ hasParent: true, isDesktop: false })).toBe("back");
    });

    it("shows the menu on top-level pages below md", () => {
        expect(resolveHeaderLeading({ hasParent: false, isDesktop: false })).toBe("menu");
    });

    it("shows nothing on top-level pages on desktop", () => {
        expect(resolveHeaderLeading({ hasParent: false, isDesktop: true })).toBe("none");
    });
});

describe("canGoBackTo", () => {
    it("matches the exact path", () => {
        expect(canGoBackTo("/transactions", "/transactions")).toBe(true);
    });

    it("matches a path with a query", () => {
        expect(canGoBackTo("/transactions?from=2026-07&to=2026-09", "/transactions")).toBe(true);
    });

    it("matches a path with a hash", () => {
        expect(canGoBackTo("/transactions#list", "/transactions")).toBe(true);
    });

    it("rejects a different path", () => {
        expect(canGoBackTo("/transactions/abc", "/transactions")).toBe(false);
        expect(canGoBackTo("/reports", "/transactions")).toBe(false);
    });

    it("rejects values that are not a non-empty string", () => {
        expect(canGoBackTo(undefined, "/transactions")).toBe(false);
        expect(canGoBackTo(null, "/transactions")).toBe(false);
        expect(canGoBackTo(42, "/transactions")).toBe(false);
        expect(canGoBackTo("", "/transactions")).toBe(false);
    });
});
