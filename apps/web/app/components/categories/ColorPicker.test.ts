// Source-text contract for the category colour picker. The web test runner is Vitest in a node environment with no
// DOM, so the swatch wiring is checked against its source, not mounted.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const source = (name: string) => readFileSync(fileURLToPath(new URL(name, import.meta.url)), "utf8");

describe("CategoriesColorPicker swatches", () => {
    const picker = source("./ColorPicker.vue");

    it("renders one button per palette colour, labelled and pressed", () => {
        expect(picker).toContain('v-for="swatch in NEW_CATEGORY_PALETTE"');
        expect(picker).toMatch(/<button[\s\S]*?type="button"[\s\S]*?:aria-label="swatch"/);
        expect(picker).toContain(':aria-pressed="isSwatchSelected(swatch)"');
    });

    it("selects the swatch that matches the colour, and none while custom is shown", () => {
        expect(picker).toContain("paletteSwatchFor(props.modelValue)");
        expect(picker).toMatch(
            /function isSwatchSelected[\s\S]*?!showCustom\.value && selectedSwatch\.value === swatch/,
        );
    });

    it("sets the colour and collapses custom when a swatch is clicked", () => {
        expect(picker).toMatch(
            /function pickSwatch\(swatch: string\) \{\s*customRequested\.value = false;\s*colorValue\.value = swatch;/,
        );
    });

    it("shows the custom row for an off-palette colour or after Custom is clicked", () => {
        expect(picker).toContain("customRequested.value || selectedSwatch.value === null");
        expect(picker).toContain('@click="customRequested = true"');
        expect(picker).toMatch(/<div\s+v-if="showCustom"[\s\S]*?<ColorPicker[\s\S]*?<InputText/);
    });

    it("keeps the custom row open while it is being edited, even when the typed hex matches a swatch", () => {
        // Typing a palette hex into an off-palette custom row must not unmount the focused input.
        expect(picker).toMatch(/<ColorPicker[\s\S]*?@update:model-value="customRequested = true"/);
        expect(picker).toMatch(/<InputText[\s\S]*?@update:model-value="customRequested = true"/);
    });

    it("labels the custom button and marks it pressed", () => {
        expect(picker).toContain('aria-label="Custom color"');
        expect(picker).toContain(':aria-pressed="showCustom"');
    });

    it("keeps the hex helpers the form validates with", () => {
        expect(picker).toContain("const ensureHashPrefix");
        expect(picker).toContain("/^#[0-9A-Fa-f]{6}$/.test(colorValue.value)");
    });

    it("lays swatches out in a wrapping row of touch-sized buttons", () => {
        expect(picker).toContain("flex flex-wrap gap-2");
        expect(picker).toContain("h-7 w-7");
    });
});
