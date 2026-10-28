import { randomUUID } from "node:crypto";

/** Object key for a new attachment. The key is random and never derived from the user's file name. */
export function newAttachmentObjectKey(userId: string): string {
    return `attachments/${userId}/${randomUUID()}`;
}

/** Object key of the thumbnail stored beside an attachment. */
export function thumbnailKeyFor(key: string): string {
    return `${key}-thumb`;
}
