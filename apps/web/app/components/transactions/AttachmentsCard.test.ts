// Source-text contract for the attachments card. The web test runner is Vitest in a node environment with no DOM,
// so the wiring is checked against its source, not mounted.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const source = readFileSync(fileURLToPath(new URL("./AttachmentsCard.vue", import.meta.url)), "utf8");

// The template's own text: everything after the first <template> tag, which the script block precedes.
const template = source.slice(source.indexOf("\n<template>"));

// The text between the preview area's opening <button and its closing </button>.
const previewArea = (() => {
    const start = template.indexOf("<button");
    const end = template.indexOf("</button>", start);
    return start === -1 || end === -1 ? "" : template.slice(start, end + "</button>".length);
})();

describe("AttachmentsCard upload", () => {
    it("takes multiple files in one file input and accepts the shared MIME list", () => {
        expect(template).toContain("multiple");
        expect(template).toContain(':accept="ATTACHMENT_ACCEPT"');
    });

    it("never sets capture, so mobile pickers offer the camera natively", () => {
        expect(source).not.toContain("capture");
    });

    it("tracks files over the card in every state, so a refused drop still shows its overlay", () => {
        expect(source).toContain("useAttachmentDropZone(rootRef");
        expect(source).not.toContain("useDropZone(");
        expect(template).toContain("<AttachmentDropOverlay");
        expect(template).toContain('v-if="isDragging"');
    });

    it("refuses drops while the card can't take files, and never lets a refused drop open the file", () => {
        expect(source).toContain("canAccept: () => canAdd.value");
        expect(source).toContain("const canAdd = computed(() => refusal.value === null)");
    });

    it("explains each refusal in the overlay: blocked or full", () => {
        expect(source).toContain('title: "Can\'t add files here"');
        expect(source).toContain('title: "This transaction is full"');
        expect(source).toContain("ATTACHMENT_BLOCK_NOTE[blocked]");
    });

    it("keeps Add files and drops open while uploads are in flight", () => {
        expect(source).not.toContain("Uploads in progress");
        expect(source).not.toContain("isUploading");
    });

    it("counts in-flight uploads against the slots, so a pick never overshoots the limit", () => {
        expect(source).toContain("const occupiedSlots = computed(() => attachmentCount.value + uploadingCount.value)");
        expect(source).toContain("remainingAttachmentSlots(occupiedSlots.value)");
        expect(source).toContain("validateAttachmentPick(files, occupiedSlots.value)");
    });

    it("toasts each rejection with the severity its message carries, whoever caught it", () => {
        expect(source).toContain("severity: message.severity");
        expect(source).not.toContain('severity: "warn"');
    });

    it("sizes every tile identically: a 4:3 preview and a fixed-height caption", () => {
        expect(template).toContain("aspect-[4/3]");
        expect(template).toContain("h-11");
        expect(template).toContain('dir="auto"');
        expect(template).toContain("gap-2.5");
    });

    it("keeps the uploading tile in the same frame, with its progress pinned to the preview", () => {
        expect(template).toContain("Uploading &middot; {{ percent(upload.progress) }}%");
        expect(template).toContain('role="progressbar"');
    });

    it("never sets a silent maxlength on the rename input", () => {
        expect(template).not.toContain(":maxlength");
        expect(template).toContain(':invalid="renameTooLong"');
        expect(template).toContain("Name is too long");
    });

    it("drops the old FileUpload and never copies the Card or Panel chrome", () => {
        expect(source).not.toContain("FileUpload");
        expect(template).not.toContain("<Card");
        expect(template).not.toContain("<Panel");
        expect(source).not.toContain("Files aren't uploaded yet");
    });

    it("reads the expiry hint from the shared constant", () => {
        expect(source).toContain("ATTACHMENT_EXPIRY_HINT");
    });

    it("disables the add action only when the transaction is full", () => {
        expect(source).toContain("if (remainingSlots.value === 0)");
        expect(source).toContain("A transaction can have up to ${ATTACHMENT_MAX_PER_TRANSACTION} attachments.");
    });
});

describe("AttachmentsCard preview", () => {
    const openPreviewBody = (() => {
        const start = source.indexOf("const openPreview = async");
        const end = source.indexOf("const downloadAttachment", start);
        return start === -1 || end === -1 ? "" : source.slice(start, end);
    })();

    it("opens the PDF tab before the first await in the PDF branch", () => {
        // Code only: the comments in this branch mention "await" in prose.
        const pdfBranch = openPreviewBody.slice(openPreviewBody.indexOf("// PDF")).replace(/\/\/.*$/gm, "");
        const openTab = pdfBranch.indexOf('window.open("", "_blank")');
        expect(openTab).toBeGreaterThan(-1);
        // Nothing in the PDF branch may await before the tab opens, or Safari and iOS lose the user activation.
        expect(pdfBranch.indexOf("await")).toBeGreaterThan(openTab);
        expect(pdfBranch.indexOf("await getAttachmentUrl(")).toBeGreaterThan(openTab);
    });

    it("guards openPreview on storage being enabled", () => {
        expect(openPreviewBody).toMatch(/if \(!storageEnabled\.value\) return;/);
    });

    it("fetches the inline URL fresh on each preview and never reads a cached one", () => {
        expect(openPreviewBody).toContain('"inline"');
        expect(openPreviewBody).not.toContain("thumbnailUrl");
    });

    it("renders the preview as a native button, never a dynamic component named 'button'", () => {
        // `<component :is="'button'">` resolves to the globally registered PrimeVue Button, which paints the tile primary.
        expect(template).not.toContain(":is=\"storageEnabled ? 'button' : 'div'\"");
        expect(template).not.toContain("<component");
        expect(previewArea).not.toBe("");
    });

    it("disables the preview button when storage is off and never gives it an action", () => {
        expect(previewArea).toContain(':disabled="!storageEnabled"');
        expect(previewArea).toContain('@click="openPreview(attachment)"');
        // openPreview returns early when storage is off, so the disabled button can't reach the API.
        expect(openPreviewBody).toMatch(/if \(!storageEnabled\.value\) return;/);
    });

    it("labels the tile preview button with its file name", () => {
        expect(previewArea).toContain("`Preview ${attachment.fileName}`");
    });

    it("calls the same openPreview from the Preview menu item, with no second implementation", () => {
        const previewItem = source.slice(source.indexOf('label: "Preview"'), source.indexOf('label: "Download"'));
        expect(previewItem).toContain("openPreview(attachment)");
        expect(source.match(/openPreview\(/g)?.length).toBeGreaterThanOrEqual(2);
    });

    it("clears window.opener on the PDF tab before it navigates to the attachment", () => {
        const pdfBranch = openPreviewBody.slice(openPreviewBody.indexOf("// PDF")).replace(/\/\/.*$/gm, "");
        const openTab = pdfBranch.indexOf('window.open("", "_blank")');
        const clearOpener = pdfBranch.indexOf("win.opener = null");
        expect(clearOpener).toBeGreaterThan(openTab);
        expect(clearOpener).toBeLessThan(pdfBranch.indexOf("win.location.href = url"));
    });
});

describe("AttachmentsCard thumbnails", () => {
    it("keys failed thumbnails by URL so a refetched presigned URL gets a fresh try", () => {
        expect(template).toContain("failedThumbnails.has(attachment.thumbnailUrl)");
        expect(template).toContain('@error="markThumbnailFailed(attachment.thumbnailUrl)"');
        expect(source).not.toContain("failedThumbnails.has(attachment.id)");
    });
});

describe("AttachmentsCard actions", () => {
    it("has the always-visible ⋮ trigger with its accessible name", () => {
        expect(template).toContain('aria-label="Attachment actions"');
        expect(template).toContain('icon="pi pi-ellipsis-v"');
    });

    it("paints the ⋮ trigger's surface and border with normal-priority dark: variants", () => {
        // In dev, dark: variants sit outside the layers, so an !important surface class on the base beats them.
        const label = template.indexOf('aria-label="Attachment actions"');
        const trigger = template.slice(template.lastIndexOf("<Button", label), template.indexOf("/>", label));
        expect(trigger).toContain("bg-surface-0 ");
        expect(trigger).toContain("dark:bg-surface-900");
        expect(trigger).toContain("border-surface-200 ");
        expect(trigger).toContain("dark:border-surface-700");
        expect(trigger).not.toMatch(/!bg-|!border-/);
    });

    it("places the ⋮ trigger as a sibling of the preview area, never inside it", () => {
        expect(previewArea).not.toBe("");
        expect(previewArea).not.toContain('aria-label="Attachment actions"');
    });

    it("downloads through the attachment-disposition URL, not by fetching the object", () => {
        expect(source).toContain('"attachment"');
        expect(source).toContain("window.location.assign(url)");
        expect(source).not.toMatch(/\bfetch\(/);
    });

    it("shows the expiry hint on the Preview item by rendering the item's title in the Menu #item slot", () => {
        // PrimeVue's default item drops MenuItem.title, so the model property alone never reaches the DOM.
        const menu = template.slice(template.indexOf("<Menu"), template.indexOf("</Menu>") + "</Menu>".length);
        expect(menu).toContain('<template #item="{ item, props: itemProps }">');
        expect(menu).toContain('v-bind="itemProps.action"');
        expect(menu).toContain(':title="item.title"');
    });

    it("renames through the shared form dialog with the extension shown read-only", () => {
        expect(template).toContain("<SharedFormDialog");
        expect(source).toContain("splitAttachmentFileName");
        expect(source).toContain("getApiErrorMessage(error,");
    });
});

describe("AttachmentsCard remove confirm", () => {
    it("names the file in the delete confirm through middleTruncateFileName", () => {
        expect(source).toContain("middleTruncateFileName(attachment.fileName)");
        expect(source).not.toContain('Delete "${attachment.fileName}"');
    });

    it("matches the ⋮ menu's Delete wording with Cancel / Delete buttons", () => {
        expect(source).toContain('header: "Delete attachment"');
        expect(source).toContain('rejectLabel: "Cancel"');
        expect(source).toContain('acceptLabel: "Delete"');
    });
});

describe("AttachmentsCard preview dialog", () => {
    // The lightbox is the Dialog bound to lightboxOpen; slice it out so the assertions cannot match other markup.
    const lightboxDialog = (() => {
        const bind = template.indexOf('v-model:visible="lightboxOpen"');
        const start = bind === -1 ? -1 : template.lastIndexOf("<Dialog", bind);
        const end = start === -1 ? -1 : template.indexOf("</Dialog>", start);
        return start === -1 || end === -1 ? "" : template.slice(start, end + "</Dialog>".length);
    })();

    it("is found in the template", () => {
        expect(lightboxDialog).toContain("<Dialog");
    });

    it("puts the file name and Download in the header slot, not the :header prop", () => {
        expect(lightboxDialog).toContain("<template #header>");
        expect(lightboxDialog).not.toContain(":header=");
    });

    it("truncates the name to one line with dir=auto and the full name in title", () => {
        expect(lightboxDialog).toContain("truncate");
        expect(lightboxDialog).toContain('dir="auto"');
        expect(lightboxDialog).toContain(':title="lightbox?.attachment.fileName"');
    });

    it("labels the dialog with the header name", () => {
        expect(lightboxDialog).toContain('aria-labelledby="attachment-preview-title"');
        expect(lightboxDialog).toContain('id="attachment-preview-title"');
    });

    it("renders Download as LayoutHeaderButton, labelled on desktop and icon-only below md", () => {
        expect(lightboxDialog).toContain("<LayoutHeaderButton");
        expect(lightboxDialog).toContain('label="Download"');
        expect(lightboxDialog).toContain('icon="pi pi-download"');
        expect(lightboxDialog).not.toContain("<Button");
    });

    it("bounds the body so no scrollbar appears, and lets the image shrink to fit", () => {
        expect(lightboxDialog).toContain("overflow-hidden");
        expect(lightboxDialog).toContain("min-h-0");
        expect(lightboxDialog).toContain("object-contain");
        expect(lightboxDialog).not.toContain("max-h-[80vh]");
    });

    it("drops the old footer Download button and its size-small outlined styling", () => {
        expect(lightboxDialog).not.toContain("outlined");
        expect(lightboxDialog).not.toContain('size="small"');
    });

    it("keeps the expiry hint under the image", () => {
        expect(lightboxDialog).toContain("{{ ATTACHMENT_EXPIRY_HINT }}");
    });
});
