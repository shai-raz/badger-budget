import type { AttachmentDisposition } from "@badger/shared-data";

/**
 * Content-Disposition for a presigned attachment URL. `attachment` carries an ASCII fallback filename for old clients
 * and the UTF-8 name in filename* (RFC 6266, RFC 5987). The name is a display name, so it is encoded here, never trusted.
 */
export function contentDispositionFor(disposition: AttachmentDisposition, fileName: string): string {
    if (disposition === "inline") return "inline";

    const ascii = fileName.replace(/[^\x20-\x7E]|["\\]/gu, "_");
    // encodeURIComponent leaves ' ( ) * alone, and RFC 5987 attr-char does not allow them.
    const encoded = encodeURIComponent(fileName).replace(
        /['()*]/g,
        (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
    );
    return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}
