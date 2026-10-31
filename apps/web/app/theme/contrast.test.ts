import { COLOR_THEMES } from "@badger/shared-data";
import { describe, expect, it } from "vitest";
import { contrastRatio } from "../utils/contrast";
import type { ColorMode } from "../utils/theme";
import { themeSwatch } from "./resolve";
import { THEMES } from "./themes";

const MODES: readonly ColorMode[] = ["light", "dark"];
const cases = COLOR_THEMES.flatMap((name) => MODES.map((mode) => ({ name, mode })));

describe.each(cases)("$name theme, $mode mode", ({ name, mode }) => {
    const swatch = themeSwatch(THEMES[name], mode);

    it("keeps button text readable on the primary colour", () => {
        expect(contrastRatio(swatch.onPrimary, swatch.primary)).toBeGreaterThanOrEqual(4.5);
    });

    it("keeps body text readable on the card and the page", () => {
        expect(contrastRatio(swatch.text, swatch.card)).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(swatch.text, swatch.page)).toBeGreaterThanOrEqual(4.5);
    });

    it("keeps muted text readable on the card and the page", () => {
        expect(contrastRatio(swatch.muted, swatch.card)).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(swatch.muted, swatch.page)).toBeGreaterThanOrEqual(4.5);
    });

    if (mode === "dark") {
        // Light-mode amounts are deliberately not checked: the owner kept today's
        // teal-500 / rose-500 on 2026-10-29. The +/- sign carries the meaning there.
        it("keeps amounts readable on the card", () => {
            for (const amount of [swatch.income, swatch.incomeStrong, swatch.expense]) {
                expect(contrastRatio(amount, swatch.card)).toBeGreaterThanOrEqual(4.5);
            }
        });
    }
});
