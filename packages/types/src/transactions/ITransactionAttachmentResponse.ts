export interface ITransactionAttachmentResponse {
    id: string;
    transactionId: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    /**
     * Object-storage key for the uploaded file.
     * Null until the actual file upload phase is implemented —
     * metadata-only attachments cannot be downloaded or previewed.
     */
    storageKey: string | null;
    createdAt: Date;
    updatedAt: Date;
    deletedAt: Date | null;
}
