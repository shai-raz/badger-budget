import { splitAttachmentFileName } from "@badger/utils";

const TAIL_CHARS = 6;
const MAX_EXT_CHARS = 5;

/** Shortens a long file name in the middle, keeping its start and extension ("Receipt_from_the_hardw…e_2026.pdf"). Counts code points; never longer than maxLength. */
export function middleTruncateFileName(name: string, maxLength = 40): string {
    if (Array.from(name).length <= maxLength) return name;

    const { base, ext } = splitAttachmentFileName(name);
    const suffix = ext !== "" && Array.from(ext).length <= MAX_EXT_CHARS ? `.${ext}` : "";
    const stem = Array.from(suffix ? base : name);
    const tail = stem.slice(-TAIL_CHARS).join("") + suffix;
    const tailChars = Array.from(tail);
    const room = maxLength - 1;
    if (tailChars.length > room) return `…${tailChars.slice(tailChars.length - Math.max(0, room)).join("")}`;

    const headLen = room - tailChars.length;
    const head = stem.slice(0, headLen).join("").trimEnd();
    return `${head}…${tail}`;
}
