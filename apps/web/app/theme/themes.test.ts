import { describe, expect, it } from "vitest";
import { chartColors, noirTheme } from "./themes";

describe("chartColors", () => {
    it("draws slice borders in the card surface of each mode", () => {
        expect(chartColors(noirTheme, "light").sliceBorder).toBe(noirTheme.surface[0]);
        expect(chartColors(noirTheme, "dark").sliceBorder).toBe(noirTheme.surface[900]);
    });

    it("uses the surface-300 hex for the Other slice in both modes", () => {
        expect(chartColors(noirTheme, "light").other).toBe(noirTheme.surface[300]);
        expect(chartColors(noirTheme, "dark").other).toBe(noirTheme.surface[300]);
    });

    it("returns hex strings, since Chart.js cannot read CSS variables", () => {
        const colors = chartColors(noirTheme, "dark");
        expect(colors.sliceBorder).toMatch(/^#[0-9A-Fa-f]{6}$/);
        expect(colors.other).toMatch(/^#[0-9A-Fa-f]{6}$/);
    });
});
