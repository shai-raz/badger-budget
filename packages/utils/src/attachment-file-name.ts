import { ATTACHMENT_NAME_MAX_LENGTH, type AttachmentExtension } from "@badger/shared-data";

/** Splits at the last dot: { base, ext } (ext without the dot, '' if none). */
export function splitAttachmentFileName(name: string): { base: string; ext: string } {
    const dot = name.lastIndexOf(".");
    if (dot === -1) return { base: name, ext: "" };
    return { base: name.slice(0, dot), ext: name.slice(dot + 1) };
}

/** Sanitized base name (no extension). Returns '' when nothing is left. Used directly by rename. */
export function sanitizeAttachmentBaseName(raw: string, ext: AttachmentExtension): string {
    let name = raw
        .normalize("NFC")
        .replace(/[\p{Cc}\p{Cf}]/gu, "")
        .replace(/[/\\:*?"<>|]/g, "")
        .replace(/\s+/gu, " ")
        .trim()
        .replace(/^\.+/, "")
        .trim();

    const suffix = `.${ext}`;
    if (name.toLowerCase().endsWith(suffix)) name = name.slice(0, -suffix.length);
    name = name.replace(/[. ]+$/, "");

    const maxBaseLength = ATTACHMENT_NAME_MAX_LENGTH - ext.length - 1;
    return Array.from(name).slice(0, maxBaseLength).join("").trim();
}

/** Display name for an upload: drops raw's own extension, sanitizes, appends .ext; falls back to `attachment.<ext>`. Never throws. */
export function sanitizeAttachmentFileName(raw: string, ext: AttachmentExtension): string {
    const { base } = splitAttachmentFileName(raw);
    const stem = base.trim() === "" ? raw : base;
    const name = sanitizeAttachmentBaseName(stem, ext);
    return name === "" ? `attachment.${ext}` : `${name}.${ext}`;
}
