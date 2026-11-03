// Source-text contract for the shared form dialog's Escape handling. This runs in the node `unit` project, so the
// dialog is checked against its source, not mounted. DOM component tests live in `*.nuxt.test.ts` (the `nuxt` project).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const source = (name: string) => readFileSync(fileURLToPath(new URL(name, import.meta.url)), "utf8");

describe("FormDialog Escape", () => {
    const dialog = source("./FormDialog.vue");

    it("keeps PrimeVue's own Escape close unless isolated", () => {
        expect(dialog).toContain("isolateEscape: false");
    });

    it("holds PrimeVue's Escape close off while a stacked dialog is open", () => {
        expect(dialog).toContain("suspendEscape: false");
        expect(dialog).toContain(':close-on-escape="isolateEscape || suspendEscape ? false : !busy"');
    });

    it("claims Escape on the mask so a parent dialog never sees it", () => {
        expect(dialog).toMatch(
            /\.\.\.\(props\.isolateEscape \? \{ mask: \{ tabindex: -1, onKeydown: onMaskKeydown \} \} : \{\}\),/,
        );
        expect(dialog).toContain(':pt="dialogPt"');
        expect(dialog).toMatch(
            /const onMaskKeydown = \(event: KeyboardEvent\) => \{\s*if \(event\.key !== "Escape"\) return;\s*event\.stopPropagation\(\);\s*event\.preventDefault\(\);/,
        );
    });

    it("keeps focus focusable on the mask so a click on the dimmed area does not drop it to body", () => {
        expect(dialog).toContain("mask: { tabindex: -1, onKeydown: onMaskKeydown }");
        expect(dialog).not.toContain("root: { tabindex: -1");
    });

    it("closes through the same path as the header close, and not while busy", () => {
        expect(dialog).toMatch(/if \(!props\.busy\) emit\("update:visible", false\);/);
    });
});

describe("FormDialog fill body", () => {
    const dialog = source("./FormDialog.vue");

    it("lets the body fill a fullscreen dialog below md, only when asked", () => {
        expect(dialog).toContain("fillBody: false,");
        expect(dialog).toContain("...(props.fillBody");
        expect(dialog).toContain(
            'content: { class: "max-md:flex max-md:min-h-0 max-md:flex-col max-md:overflow-hidden" }',
        );
        expect(dialog).toContain(`:class="{ 'max-md:min-h-0 max-md:flex-1': fillBody }"`);
    });
});

describe("FormDialog back step", () => {
    const dialog = source("./FormDialog.vue");

    it("takes an optional back label and emits back", () => {
        expect(dialog).toContain("backLabel?: string;");
        expect(dialog).toContain("back: [];");
    });

    it("puts a labelled back arrow before the title only when a back label is set", () => {
        expect(dialog).toContain('v-if="backLabel"');
        expect(dialog).toContain('icon="pi pi-arrow-left"');
        expect(dialog).toContain(':aria-label="backLabel"');
    });

    it("names the dialog itself, since the custom header's title is not the labelledby target", () => {
        expect(dialog).toContain(':aria-label="backLabel ? header : undefined"');
    });

    it("makes the footer cancel return to the previous step instead of closing", () => {
        expect(dialog).toContain("@click=\"backLabel ? emit('back') : emit('update:visible', false)\"");
    });
});
