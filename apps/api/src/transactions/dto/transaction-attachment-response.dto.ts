import { ApiProperty } from "@nestjs/swagger";
import type { ITransactionAttachmentResponse } from "@badger/types";

export class TransactionAttachmentResponseDto implements ITransactionAttachmentResponse {
    @ApiProperty()
    id: string;

    @ApiProperty()
    transactionId: string;

    @ApiProperty()
    fileName: string;

    @ApiProperty()
    mimeType: string;

    @ApiProperty()
    sizeBytes: number;

    @ApiProperty({
        type: String,
        nullable: true,
        description: "Object-storage key for the uploaded file. Null until the file upload phase is implemented.",
    })
    storageKey: string | null;

    @ApiProperty()
    createdAt: Date;

    @ApiProperty()
    updatedAt: Date;

    @ApiProperty({ type: Date, nullable: true })
    deletedAt: Date | null;
}
