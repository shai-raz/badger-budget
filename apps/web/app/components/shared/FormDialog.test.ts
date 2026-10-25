// Source-text contract for the shared form dialog's Escape handling. The web test runner is Vitest in a node
// environment with no DOM, so the dialog is checked against its source, not mounted.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const source = (name: string) => readFileSync(fileURLToPath(new URL(name, import.meta.url)), "utf8");

describe("FormDialog Escape", () => {
    const dialog = source("./FormDialog.vue");

    it("keeps PrimeVue's own Escape close unless isolated", () => {
        expect(dialog).toContain("isolateEscape: false");
        expect(dialog).toContain(':close-on-escape="isolateEscape ? false : !busy"');
    });

    it("claims Escape on the dialog root so a parent dialog never sees it", () => {
        expect(dialog).toMatch(
            /const dialogPt = computed\(\(\) =>\s*props\.isolateEscape \? \{ root: \{ tabindex: -1, onKeydown: onRootKeydown \} \} : undefined,?\s*\);/,
        );
        expect(dialog).toContain(':pt="dialogPt"');
        expect(dialog).toMatch(
            /function onRootKeydown|const onRootKeydown = \(event: KeyboardEvent\) => \{\s*if \(event\.key !== "Escape"\) return;\s*event\.stopPropagation\(\);\s*event\.preventDefault\(\);/,
        );
    });

    it("closes through the same path as the header close, and not while busy", () => {
        expect(dialog).toMatch(/if \(!props\.busy\) emit\("update:visible", false\);/);
    });
});
