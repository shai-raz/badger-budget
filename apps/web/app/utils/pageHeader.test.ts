import { describe, expect, it } from "vitest";
import { resolveHeaderLeading } from "./pageHeader";

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
