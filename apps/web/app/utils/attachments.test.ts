import { describe, expect, it } from "vitest";
import { ATTACHMENT_MAX_BYTES } from "@badger/shared-data";
import {
    ATTACHMENT_ACCEPT,
    ATTACHMENT_EXPIRY_HINT,
    ATTACHMENT_HELPER_TEXT,
    attachmentRejectMessage,
    failedUploadsDetail,
    fileIcon,
    fileIconClass,
    fileKind,
    formatFileSize,
    remainingAttachmentSlots,
    uploadingHeader,
    validateAttachmentPick,
    type PickedFile,
} from "./attachments";

const pick = (name: string, type: string, size = 1024): PickedFile => ({ name, type, size });

describe("validateAttachmentPick", () => {
    it("accepts JPEG, PNG, WebP and PDF", () => {
        const files = [
            pick("a.jpg", "image/jpeg"),
            pick("b.png", "image/png"),
            pick("c.webp", "image/webp"),
            pick("d.pdf", "application/pdf"),
        ];
        const { accepted, rejected } = validateAttachmentPick(files, 0);
        expect(accepted).toEqual(files);
        expect(rejected).toEqual([]);
    });

    it("rejects GIF, SVG and HEIC by type", () => {
        const result = validateAttachmentPick(
            [pick("a.gif", "image/gif"), pick("b.svg", "image/svg+xml"), pick("c.heic", "image/heic")],
            0,
        );
        expect(result.accepted).toEqual([]);
        expect(result.rejected.map((r) => r.reason)).toEqual(["type", "type", "type"]);
    });

    it("rejects a file with an empty size as empty", () => {
        const result = validateAttachmentPick([pick("a.pdf", "application/pdf", 0)], 0);
        expect(result.rejected).toEqual([{ file: expect.objectContaining({ name: "a.pdf" }), reason: "empty" }]);
    });

    it("rejects a file over 10 MB as size", () => {
        const tooBig = pick("big.pdf", "application/pdf", ATTACHMENT_MAX_BYTES + 100_000);
        const atLimit = pick("ok.pdf", "application/pdf", ATTACHMENT_MAX_BYTES);
        const result = validateAttachmentPick([tooBig, atLimit], 0);
        expect(result.accepted).toEqual([atLimit]);
        expect(result.rejected).toEqual([{ file: tooBig, reason: "size" }]);
    });

    it("falls back to the extension when the type is empty", () => {
        const result = validateAttachmentPick(
            [pick("scan.JPG", ""), pick("scan.jpeg", ""), pick("scan.webp", ""), pick("scan.pdf", "")],
            0,
        );
        expect(result.accepted).toHaveLength(4);
        expect(result.rejected).toEqual([]);
    });

    it("rejects an empty type with a disallowed extension", () => {
        const result = validateAttachmentPick([pick("anim.gif", ""), pick("noext", "")], 0);
        expect(result.rejected.map((r) => r.reason)).toEqual(["type", "type"]);
    });

    it("fills the remaining slots and rejects the rest as limit", () => {
        const picked = [1, 2, 3, 4].map((n) => pick(`f${n}.pdf`, "application/pdf"));
        const { accepted, rejected } = validateAttachmentPick(picked, 8);
        expect(accepted).toEqual(picked.slice(0, 2));
        expect(rejected).toEqual([
            { file: picked[2], reason: "limit" },
            { file: picked[3], reason: "limit" },
        ]);
    });

    it("does not spend a slot on a file that is already invalid", () => {
        const bad = pick("bad.gif", "image/gif");
        const good = pick("good.pdf", "application/pdf");
        const { accepted, rejected } = validateAttachmentPick([bad, good], 9);
        expect(accepted).toEqual([good]);
        expect(rejected).toEqual([{ file: bad, reason: "type" }]);
    });
});

describe("remainingAttachmentSlots", () => {
    it("counts down from the per-transaction limit and never goes negative", () => {
        expect(remainingAttachmentSlots(0)).toBe(10);
        expect(remainingAttachmentSlots(8)).toBe(2);
        expect(remainingAttachmentSlots(12)).toBe(0);
    });
});

describe("attachmentRejectMessage", () => {
    it("names the file for each reason", () => {
        expect(attachmentRejectMessage("a.gif", "type").detail).toContain("a.gif");
        expect(attachmentRejectMessage("a.pdf", "size").summary).toBe("File too large");
        expect(attachmentRejectMessage("a.pdf", "empty").detail).toContain("a.pdf");
        expect(attachmentRejectMessage("a.pdf", "limit").summary).toBe("Attachment limit reached");
    });
});

describe("copy helpers", () => {
    it("derives the accept list from the shared MIME types", () => {
        expect(ATTACHMENT_ACCEPT).toBe("image/jpeg,image/png,image/webp,application/pdf");
    });

    it("derives the size and expiry text from the shared limits", () => {
        expect(ATTACHMENT_HELPER_TEXT).toBe("JPEG, PNG, WebP or PDF, up to 10 MB each");
        expect(ATTACHMENT_EXPIRY_HINT).toBe("Opened links expire after 1 hour. Download the file to keep a copy.");
    });

    it("pluralises the upload header", () => {
        expect(uploadingHeader(1)).toBe("Uploading 1 file");
        expect(uploadingHeader(2)).toBe("Uploading 2 files");
    });

    it("lists the failed names in the retry message", () => {
        expect(failedUploadsDetail(["a.pdf", "b.jpg"])).toBe(
            "Couldn't upload a.pdf, b.jpg. Try again from the transaction page.",
        );
    });

    it("maps MIME types to icon, icon colour and kind", () => {
        expect(fileIcon("image/png")).toBe("pi pi-image");
        expect(fileIcon("application/pdf")).toBe("pi pi-file-pdf");
        expect(fileIcon("text/plain")).toBe("pi pi-file");
        expect(fileIconClass("image/png")).toBe("text-teal-500");
        expect(fileIconClass("application/pdf")).toBe("text-rose-500");
        expect(fileKind("image/webp")).toBe("Photo");
        expect(fileKind("application/pdf")).toBe("PDF");
    });

    it("formats sizes in B, KB and MB", () => {
        expect(formatFileSize(512)).toBe("512 B");
        expect(formatFileSize(2048)).toBe("2 KB");
        expect(formatFileSize(1572864)).toBe("1.5 MB");
    });
});
