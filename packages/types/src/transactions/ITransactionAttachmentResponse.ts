import type { AttachmentMimeType } from "@badger/shared-data";

export interface ITransactionAttachmentResponse {
    id: string;
    transactionId: string;
    fileName: string;
    mimeType: AttachmentMimeType;
    sizeBytes: number;
    createdAt: Date;
    updatedAt: Date;
}
