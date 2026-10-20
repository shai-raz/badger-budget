import { ApiProperty } from "@nestjs/swagger";
import { IsInt, IsString, MaxLength, Min } from "class-validator";
import type { ICreateTransactionAttachment } from "@badger/types";

export class CreateTransactionAttachmentDto implements ICreateTransactionAttachment {
    @ApiProperty({ example: "receipt.jpg" })
    @IsString()
    @MaxLength(255)
    fileName: string;

    @ApiProperty({ example: "image/jpeg" })
    @IsString()
    @MaxLength(100)
    mimeType: string;

    @ApiProperty({ example: 1258291 })
    @IsInt()
    @Min(1)
    sizeBytes: number;
}
