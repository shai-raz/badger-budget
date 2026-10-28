export interface IAttachmentUrlResponse {
    /** Presigned GET URL for the attachment's bytes. */
    url: string;
    /** ISO 8601 time after which the URL no longer works. */
    expiresAt: string;
}
