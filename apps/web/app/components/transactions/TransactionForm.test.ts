// Source-text contract for the transaction form's deferred category dialog. The web test runner is Vitest in a node
// environment with no DOM, so the wiring is checked against its source, not mounted.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const source = (name: string) => readFileSync(fileURLToPath(new URL(name, import.meta.url)), "utf8");

describe("TransactionForm customise dialog", () => {
    const form = source("./TransactionForm.vue");

    it("tells the hosting dialog when the deferred category dialog opens or closes", () => {
        expect(form).toContain('watch(customiseOpen, (open) => emit("customiseOpenChange", open));');
    });

    it("releases the hosting dialog's Escape if the form unmounts while the category dialog is open", () => {
        expect(form).toMatch(
            /onBeforeUnmount\(\(\) => \{\s*if \(customiseOpen\.value\) emit\("customiseOpenChange", false\);\s*\}\);/,
        );
    });
});
