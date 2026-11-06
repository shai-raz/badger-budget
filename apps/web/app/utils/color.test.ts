import { describe, expect, it } from "vitest";
import { cssVarColor } from "./color";

describe("cssVarColor", () => {
    it("returns a var() token as-is", () => {
        expect(cssVarColor("var(--p-amount-income)")).toBe("var(--p-amount-income)");
    });

    it("trims surrounding whitespace from a var() token", () => {
        expect(cssVarColor(" var(--p-text-muted-color) ")).toBe("var(--p-text-muted-color)");
    });

    it.each(["#10B981", "red", "", "   ", "var(--a, #fff)", "var(--a); background: red", "var(a)", "var(--a)x"])(
        "rejects %j",
        (value) => {
            expect(cssVarColor(value)).toBeNull();
        },
    );

    it("rejects null and undefined", () => {
        expect(cssVarColor(null)).toBeNull();
        expect(cssVarColor(undefined)).toBeNull();
    });
});
