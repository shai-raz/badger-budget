import { ApiProperty } from "@nestjs/swagger";
import type { IAttachmentUrlResponse } from "@badger/types";

export class AttachmentUrlResponseDto implements IAttachmentUrlResponse {
    @ApiProperty({ description: "Presigned GET URL, valid until expiresAt" })
    url: string;

    @ApiProperty({ format: "date-time" })
    expiresAt: string;
}
