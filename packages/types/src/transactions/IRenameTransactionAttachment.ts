export interface IRenameTransactionAttachment {
    /** New base name. The server sanitizes it and keeps the extension of the stored type. */
    fileName: string;
}
