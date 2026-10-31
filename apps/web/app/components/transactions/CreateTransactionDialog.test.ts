// Source-text contract for the create dialog's save lock. The web test runner is Vitest in a node environment with no
// DOM, so the wiring is checked against its source, not mounted.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const source = (name: string) => readFileSync(fileURLToPath(new URL(name, import.meta.url)), "utf8");

describe("CreateTransactionDialog save lock", () => {
    const dialog = source("./CreateTransactionDialog.vue");

    it("refuses a second submit while a save is already running", () => {
        expect(dialog).toMatch(/const handleSave = async \(\) => \{\s*if \(saving\.value\) return;/);
    });

    it("counts a running save as busy, so the form, footer and dismiss controls stay locked", () => {
        expect(dialog).toContain(
            "const busy = computed(() => saving.value || isPending.value || creatingCategory.value);",
        );
    });

    it("shows 'Saving…' on the Save button while busy", () => {
        expect(dialog).toContain(`:save-label="busy ? 'Saving…' : 'Save'"`);
    });

    it("waits for every upload to settle before closing the dialog", () => {
        const upload = dialog.indexOf("await uploadFiles(created.id, files)");
        const close = dialog.indexOf("close();", upload);
        expect(upload).toBeGreaterThan(-1);
        expect(close).toBeGreaterThan(upload);
    });

    it("releases the save lock in finally, so a failed create leaves the form editable", () => {
        expect(dialog).toMatch(/\} finally \{\s*saving\.value = false;\s*\}/);
    });

    it("reads the queued files before the create, so a failed create keeps them for a retry", () => {
        const read = dialog.indexOf("formRef.value!.queuedAttachments()");
        const create = dialog.indexOf("await saveWithPendingCategory(");
        expect(read).toBeGreaterThan(-1);
        expect(create).toBeGreaterThan(read);
    });

    it("passes the attachment gate and the upload states to the form", () => {
        expect(dialog).toMatch(
            /const showAttachments = computed\(\s*\(\) => canUseAttachmentStorage\(instanceConfig\.data\.value\) && !isDemoUser\(authStore\.user\),?\s*\);/,
        );
        expect(dialog).toContain(':show-attachments="showAttachments"');
        expect(dialog).toContain(':attachment-uploads="uploads"');
        expect(dialog).toContain(':disabled="busy"');
    });
});
