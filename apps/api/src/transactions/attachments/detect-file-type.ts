import { ATTACHMENT_EXTENSION_BY_MIME, type AttachmentExtension, type AttachmentMimeType } from "@badger/shared-data";

export interface DetectedAttachmentType {
    mime: AttachmentMimeType;
    ext: AttachmentExtension;
}

const JPEG_SIGNATURE = Buffer.from([0xff, 0xd8, 0xff]);
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const RIFF_TAG = Buffer.from("RIFF", "ascii");
const WEBP_TAG = Buffer.from("WEBP", "ascii");
const PDF_SIGNATURE = Buffer.from("%PDF-", "ascii");

function bytesAt(buf: Buffer, offset: number, expected: Buffer): boolean {
    return buf.length >= offset + expected.length && buf.subarray(offset, offset + expected.length).equals(expected);
}

/**
 * Identifies an attachment from its leading magic bytes. The client MIME type and the file extension are never
 * trusted. Returns null for anything that is not a JPEG, PNG, WebP or PDF.
 */
export function detectAttachmentType(buf: Buffer): DetectedAttachmentType | null {
    const detected = detectMime(buf);
    return detected === null ? null : { mime: detected, ext: ATTACHMENT_EXTENSION_BY_MIME[detected] };
}

function detectMime(buf: Buffer): AttachmentMimeType | null {
    if (bytesAt(buf, 0, JPEG_SIGNATURE)) return "image/jpeg";
    if (bytesAt(buf, 0, PNG_SIGNATURE)) return "image/png";
    if (bytesAt(buf, 0, RIFF_TAG) && bytesAt(buf, 8, WEBP_TAG)) return "image/webp";
    if (bytesAt(buf, 0, PDF_SIGNATURE)) return "application/pdf";
    return null;
}
