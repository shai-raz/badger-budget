// Source-text contract for the transaction form's attachment queue. The web test runner is Vitest in a node environment
// with no DOM, so the wiring is checked against its source, not mounted.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const source = readFileSync(fileURLToPath(new URL("./AttachmentQueueField.vue", import.meta.url)), "utf8");

// The template's own text: everything after the first <template> tag, which the script block precedes.
const template = source.slice(source.indexOf("\n<template>"));

// The remove button: the <Button> element whose aria-label names the queued file.
const removeButton = (() => {
    const label = template.indexOf("`Remove ${file.name}`");
    const start = template.lastIndexOf("<Button", label);
    const end = template.indexOf("/>", label);
    return label === -1 || start === -1 || end === -1 ? "" : template.slice(start, end);
})();

describe("AttachmentQueueField picker", () => {
    it("takes multiple files in one file input and accepts the shared MIME list", () => {
        expect(template).toContain("multiple");
        expect(template).toContain(':accept="ATTACHMENT_ACCEPT"');
    });

    it("never sets capture, so mobile pickers offer the camera natively", () => {
        expect(source).not.toContain("capture");
    });

    it("validates each pick and toasts each rejection as a warning", () => {
        expect(source).toContain("validateAttachmentPick(picked, props.modelValue.length)");
        expect(source).toContain('severity: "warn"');
        expect(source).toContain("attachmentRejectMessage(file.name, reason)");
    });

    it("uses the shared helper text under the drop zone", () => {
        expect(template).toContain("ATTACHMENT_HELPER_TEXT");
    });
});

describe("AttachmentQueueField drop zone", () => {
    it("shows the overlay for any file over the field, with the reason a refused drop is refused", () => {
        expect(source).toContain("useAttachmentDropZone(");
        expect(template).toContain('v-if="isDragging"');
        expect(source).toContain('title: "Uploads in progress"');
        expect(source).toContain('title: "This transaction is full"');
        expect(source).toContain('title: "Drop files to upload"');
    });

    it("hides the zone once the queue is full, and never makes it inert", () => {
        expect(template).toContain('v-if="remainingSlots() > 0"');
        // Inert nodes drop hit-testing, so a file dropped on them would fall through to the browser tab.
        expect(template).not.toContain(":inert");
    });

    it("attaches the drop listeners to the always-rendered field root, not the zone", () => {
        expect(source).toContain("useAttachmentDropZone(rootRef");
        expect(template).toContain('ref="rootRef"');
        expect(template).not.toContain('ref="dropZoneRef"');
    });
});

describe("AttachmentQueueField thumbnails", () => {
    it("revokes object URLs when files leave the queue and when the field unmounts", () => {
        expect(source).toContain("URL.revokeObjectURL(");
        expect(source).toContain("onBeforeUnmount(");
    });
});

describe("AttachmentQueueField remove", () => {
    it("disables the remove button with the field", () => {
        expect(removeButton).not.toBe("");
        expect(removeButton).toContain(':disabled="disabled"');
    });

    it("shows a check instead of the remove button once a file is done", () => {
        expect(template).toContain('v-else-if="isDone(file)"');
        expect(template).toContain('aria-label="Uploaded"');
        expect(template).toContain('v-if="!isUploading(file) && !isDone(file)"');
    });
});
