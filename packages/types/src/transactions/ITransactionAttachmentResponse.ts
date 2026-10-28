import type { AttachmentMimeType } from "@badger/shared-data";

export interface ITransactionAttachmentResponse {
    id: string;
    transactionId: string;
    fileName: string;
    mimeType: AttachmentMimeType;
    sizeBytes: number;
    /** Presigned inline URL for the WebP thumbnail. Null when there is none. Set on upload, rename and transaction detail responses; never on list rows. */
    thumbnailUrl: string | null;
    createdAt: Date;
    updatedAt: Date;
}
