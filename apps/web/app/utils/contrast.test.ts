import { describe, expect, it } from "vitest";
import { contrastRatio, relativeLuminance } from "./contrast";

describe("relativeLuminance", () => {
    it("is 0 for black and 1 for white", () => {
        expect(relativeLuminance("#000000")).toBe(0);
        expect(relativeLuminance("#ffffff")).toBeCloseTo(1, 10);
    });
});

describe("contrastRatio", () => {
    it("is 21 for black on white", () => {
        expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 10);
    });

    it("is 1 for two equal colours", () => {
        expect(contrastRatio("#6B7280", "#6B7280")).toBe(1);
    });

    it("does not depend on which colour is the text", () => {
        expect(contrastRatio("#6B7280", "#FFFFFF")).toBeCloseTo(contrastRatio("#FFFFFF", "#6B7280"), 10);
    });

    it("matches a known pair: gray-500 on white is about 4.83", () => {
        expect(contrastRatio("#6B7280", "#FFFFFF")).toBeCloseTo(4.83, 2);
    });

    it("rejects a value that is not a hex colour", () => {
        expect(() => contrastRatio("rgba(0, 0, 0, .5)", "#ffffff")).toThrow();
    });
});
