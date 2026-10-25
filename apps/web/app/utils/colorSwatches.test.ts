import { describe, expect, it } from "vitest";
import { NEW_CATEGORY_PALETTE } from "~/utils/pendingCategory";
import { paletteSwatchFor } from "./colorSwatches";

describe("paletteSwatchFor", () => {
    it("returns the palette entry for a palette colour", () => {
        expect(paletteSwatchFor("#ef4444")).toBe("#EF4444");
        expect(paletteSwatchFor("#EF4444")).toBe("#EF4444");
    });

    it("accepts a colour without the leading '#'", () => {
        expect(paletteSwatchFor("ef4444")).toBe("#EF4444");
    });

    it("ignores surrounding whitespace", () => {
        expect(paletteSwatchFor("  #ef4444 ")).toBe("#EF4444");
    });

    it("returns each palette entry for itself", () => {
        for (const swatch of NEW_CATEGORY_PALETTE) {
            expect(paletteSwatchFor(swatch)).toBe(swatch);
        }
    });

    it("returns null for a custom colour", () => {
        expect(paletteSwatchFor("#123456")).toBeNull();
    });

    it("returns null for an empty or missing colour", () => {
        expect(paletteSwatchFor(null)).toBeNull();
        expect(paletteSwatchFor(undefined)).toBeNull();
        expect(paletteSwatchFor("")).toBeNull();
        expect(paletteSwatchFor("   ")).toBeNull();
    });
});
