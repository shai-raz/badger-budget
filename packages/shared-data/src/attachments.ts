/** MIME types accepted for transaction attachments (enforced by the API via magic bytes, mirrored in the web UI). */
export const ATTACHMENT_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const;
export type AttachmentMimeType = (typeof ATTACHMENT_MIME_TYPES)[number];

/** File extension used for each accepted MIME type (enforced by the API, mirrored in the web UI). */
export const ATTACHMENT_EXTENSION_BY_MIME = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "application/pdf": "pdf",
} as const satisfies Record<AttachmentMimeType, string>;
export type AttachmentExtension = (typeof ATTACHMENT_EXTENSION_BY_MIME)[AttachmentMimeType];

/** Type guard for values that are one of ATTACHMENT_MIME_TYPES. */
export function isAttachmentMimeType(value: string): value is AttachmentMimeType {
    return (ATTACHMENT_MIME_TYPES as readonly string[]).includes(value);
}

/** Largest accepted attachment, in bytes (enforced by the API, mirrored in the web UI). */
export const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
/** Maximum number of attachments per transaction (enforced by the API, mirrored in the web UI). */
export const ATTACHMENT_MAX_PER_TRANSACTION = 10;
/** Lifetime of a presigned attachment URL, in seconds (enforced by the API). */
export const ATTACHMENT_URL_TTL_SECONDS = 3600;
/** Maximum length of an attachment display name, including its extension (enforced by the API, mirrored in the web UI). */
export const ATTACHMENT_NAME_MAX_LENGTH = 100;

/** How an attachment is served: shown inline in the browser or downloaded. */
export const ATTACHMENT_DISPOSITIONS = ["inline", "attachment"] as const;
export type AttachmentDisposition = (typeof ATTACHMENT_DISPOSITIONS)[number];
