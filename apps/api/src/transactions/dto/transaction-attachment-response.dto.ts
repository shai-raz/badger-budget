import { ApiProperty } from "@nestjs/swagger";
import type { AttachmentMimeType } from "@badger/shared-data";
import { ATTACHMENT_MIME_TYPES } from "@badger/shared-data";
import type { ITransactionAttachmentResponse } from "@badger/types";

export class TransactionAttachmentResponseDto implements ITransactionAttachmentResponse {
    @ApiProperty()
    id: string;

    @ApiProperty()
    transactionId: string;

    @ApiProperty()
    fileName: string;

    @ApiProperty({ enum: [...ATTACHMENT_MIME_TYPES] })
    mimeType: AttachmentMimeType;

    @ApiProperty()
    sizeBytes: number;

    @ApiProperty()
    createdAt: Date;

    @ApiProperty()
    updatedAt: Date;
}
