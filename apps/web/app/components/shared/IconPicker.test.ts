// Source-text contract for the shared icon picker. The web test runner is Vitest in a node environment with no
// DOM, so the component's accessibility wiring is checked against its source, not mounted.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const source = (name: string) => readFileSync(fileURLToPath(new URL(name, import.meta.url)), "utf8");

describe("IconPicker trigger", () => {
    const picker = source("./IconPicker.vue");

    it("is a real button that announces the popover state", () => {
        expect(picker).toMatch(/<button[\s\S]*?type="button"/);
        expect(picker).toContain('aria-haspopup="dialog"');
        expect(picker).toContain(':aria-expanded="open"');
    });

    it("wraps a large avatar with the pencil badge", () => {
        expect(picker).toContain('size="lg"');
        expect(picker).toContain("pi pi-pencil");
    });
});

describe("IconPicker popover", () => {
    const picker = source("./IconPicker.vue");

    it("focuses the search field on show and clears the query on hide", () => {
        expect(picker).toMatch(/<InputText[\s\S]*?autofocus/);
        expect(picker).toContain('@hide="onHide"');
        expect(picker).toMatch(/function onHide\(\) \{\s*open\.value = false;\s*query\.value = "";/);
    });

    it("stops Escape from reaching a hosting dialog", () => {
        expect(picker).toContain('@keydown.esc="onEscape"');
        expect(picker).toMatch(/function onEscape[\s\S]*?event\.stopPropagation\(\);[\s\S]*?hide\(\);/);
    });

    it("moves tile focus with the shared grid helpers and the picker column count", () => {
        expect(picker).toContain("ICON_PICKER_COLUMNS");
        expect(picker).toContain("moveGridFocus(cells.value, index, event.key)");
        expect(picker).toContain("grid grid-cols-6");
    });

    it("marks the selected tile with aria-pressed and a visible ring", () => {
        expect(picker).toContain(':aria-pressed="modelValue === name"');
        expect(picker).toContain("ring-2 ring-primary");
    });

    it("labels each tile from the registry", () => {
        expect(picker).toContain(':aria-label="AVATAR_ICON_META[name].label"');
    });

    it("shows the default tile only while the query is empty", () => {
        expect(picker).toContain("!searching.value");
    });
});
