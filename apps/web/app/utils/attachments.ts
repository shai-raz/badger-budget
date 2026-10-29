import {
    ATTACHMENT_EXTENSION_BY_MIME,
    ATTACHMENT_MAX_BYTES,
    ATTACHMENT_MAX_PER_TRANSACTION,
    ATTACHMENT_MIME_TYPES,
    ATTACHMENT_URL_TTL_SECONDS,
    isAttachmentMimeType,
} from "@badger/shared-data";

const BYTES_PER_MB = 1024 * 1024;

/** Value for the file input's `accept` attribute. */
export const ATTACHMENT_ACCEPT = ATTACHMENT_MIME_TYPES.join(",");

export const ATTACHMENT_HELPER_TEXT = `JPEG, PNG, WebP or PDF, up to ${ATTACHMENT_MAX_BYTES / BYTES_PER_MB} MB each`;

const EXPIRY_HOURS = ATTACHMENT_URL_TTL_SECONDS / 3600;
export const ATTACHMENT_EXPIRY_HINT = `Opened links expire after ${EXPIRY_HOURS} ${EXPIRY_HOURS === 1 ? "hour" : "hours"}. Download the file to keep a copy.`;

/** Extensions accepted when the browser reports no MIME type. UX only: the server checks the bytes. */
const FALLBACK_EXTENSIONS: ReadonlySet<string> = new Set([...Object.values(ATTACHMENT_EXTENSION_BY_MIME), "jpeg"]);

export type AttachmentRejectReason = "type" | "size" | "empty" | "limit";

/** The part of a File that validation reads. A File satisfies it. */
export interface PickedFile {
    name: string;
    type: string;
    size: number;
}

export function fileIcon(mimeType: string): string {
    if (mimeType.startsWith("image/")) return "pi pi-image";
    if (mimeType === "application/pdf") return "pi pi-file-pdf";
    return "pi pi-file";
}

export function fileIconClass(mimeType: string): string {
    if (mimeType.startsWith("image/")) return "text-teal-500";
    if (mimeType === "application/pdf") return "text-rose-500";
    return "text-surface-500 dark:text-surface-400";
}

const SHORT_TYPE_LABEL: Record<string, string> = {
    "image/jpeg": "JPEG",
    "image/png": "PNG",
    "image/webp": "WEBP",
    "application/pdf": "PDF",
};

/** Short type label for a tile's meta line, e.g. "PNG". */
export function fileKind(mimeType: string): string {
    return SHORT_TYPE_LABEL[mimeType] ?? "File";
}

export function formatFileSize(bytes: number): string {
    if (bytes >= BYTES_PER_MB) return `${(bytes / BYTES_PER_MB).toFixed(1)} MB`;
    if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${bytes} B`;
}

/** How many more attachments a transaction can take. */
export function remainingAttachmentSlots(existingCount: number): number {
    return Math.max(0, ATTACHMENT_MAX_PER_TRANSACTION - existingCount);
}

function extensionOf(fileName: string): string {
    const dot = fileName.lastIndexOf(".");
    return dot < 0 ? "" : fileName.slice(dot + 1).toLowerCase();
}

/** The first reason a single picked file is unacceptable on its own, or null when it is fine. */
function fileProblem(file: PickedFile): Exclude<AttachmentRejectReason, "limit"> | null {
    const typeOk = file.type === "" ? FALLBACK_EXTENSIONS.has(extensionOf(file.name)) : isAttachmentMimeType(file.type);
    if (!typeOk) return "type";
    if (file.size === 0) return "empty";
    if (file.size > ATTACHMENT_MAX_BYTES) return "size";
    return null;
}

/**
 * Splits a pick into files to upload and files to reject. Files are accepted in pick order
 * until the transaction's remaining slots run out; valid files past that point are rejected as "limit".
 */
export function validateAttachmentPick<F extends PickedFile>(
    files: F[],
    existingCount: number,
): { accepted: F[]; rejected: { file: F; reason: AttachmentRejectReason }[] } {
    const accepted: F[] = [];
    const rejected: { file: F; reason: AttachmentRejectReason }[] = [];
    const slots = remainingAttachmentSlots(existingCount);

    for (const file of files) {
        const problem = fileProblem(file);
        if (problem) {
            rejected.push({ file, reason: problem });
        } else if (accepted.length < slots) {
            accepted.push(file);
        } else {
            rejected.push({ file, reason: "limit" });
        }
    }
    return { accepted, rejected };
}

/**
 * The toast for a rejected file. One severity per reason, whoever caught it: the browser before upload or the server
 * after a 415/413/409. A refused type is an error; a size, count or empty file is a warning.
 */
export function attachmentRejectMessage(
    fileName: string,
    reason: AttachmentRejectReason,
): { severity: "warn" | "error"; summary: string; detail: string } {
    switch (reason) {
        case "type":
            return {
                severity: "error",
                summary: "Unsupported file type",
                detail: `${fileName} isn't a JPEG, PNG, WebP or PDF file.`,
            };
        case "size":
            return {
                severity: "warn",
                summary: "File too large",
                detail: `${fileName} is larger than ${ATTACHMENT_MAX_BYTES / BYTES_PER_MB} MB.`,
            };
        case "empty":
            return { severity: "warn", summary: "Empty file", detail: `${fileName} has no content.` };
        case "limit":
            return {
                severity: "warn",
                summary: "Attachment limit reached",
                detail: `A transaction can have up to ${ATTACHMENT_MAX_PER_TRANSACTION} attachments. ${fileName} wasn't added.`,
            };
    }
}

export function uploadingHeader(count: number): string {
    return count === 1 ? "Uploading 1 file" : `Uploading ${count} files`;
}

/** Where a failed upload is reported: the card on the transaction page, or the create dialog after it has closed. */
export type UploadFailureContext = "transaction" | "create";

/**
 * The toast for one file whose upload failed. The server's status says why, and uses the same wording as the
 * client-side rejections; anything else (network, 5xx) gets the generic line.
 */
export function uploadFailureMessage(
    fileName: string,
    error: unknown,
    context: UploadFailureContext,
): { severity: "warn" | "error"; summary: string; detail: string } {
    const status = (error as { response?: { status?: unknown } } | null)?.response?.status;
    if (status === 415) return attachmentRejectMessage(fileName, "type");
    if (status === 413) return attachmentRejectMessage(fileName, "size");
    if (status === 409) return attachmentRejectMessage(fileName, "limit");
    const retry = context === "create" ? "Try again from the transaction page." : "Try again.";
    return { severity: "error", summary: "Upload failed", detail: `Couldn't upload ${fileName}. ${retry}` };
}
