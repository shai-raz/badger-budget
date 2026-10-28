/** The file part of a multipart attachment upload, as the controller hands it to the service. */
export interface UploadedAttachmentFile {
    buffer: Buffer;
    originalname: string;
    size: number;
    mimetype: string;
}
