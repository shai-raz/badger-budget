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

describe("TransactionForm attachments field", () => {
    const form = source("./TransactionForm.vue");

    it("renders the queue field between the notes and the hidden toggle", () => {
        const notes = form.indexOf('id="tx-notes"');
        const queue = form.indexOf("<AttachmentQueueField");
        const hidden = form.indexOf('input-id="tx-hidden"');
        expect(notes).toBeGreaterThan(-1);
        expect(queue).toBeGreaterThan(notes);
        expect(hidden).toBeGreaterThan(queue);
    });

    it("shows the queue only in create mode and behind the showAttachments prop", () => {
        expect(form).toContain('v-if="!isEdit && showAttachments"');
    });

    it("disables the queue with the form", () => {
        const tag = form.slice(
            form.indexOf("<AttachmentQueueField"),
            form.indexOf("/>", form.indexOf("<AttachmentQueueField")),
        );
        expect(tag).toContain(':disabled="disabled"');
    });

    it("exposes the queued files, and none when the field is off", () => {
        expect(form).toContain(
            "queuedAttachments: (): File[] => (props.showAttachments ? [...queuedAttachments.value] : [])",
        );
    });
});
