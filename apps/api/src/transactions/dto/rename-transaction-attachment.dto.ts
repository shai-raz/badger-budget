import { ApiProperty } from "@nestjs/swagger";
import { IsString, MaxLength } from "class-validator";

/** Body for `PATCH /transactions/:id/attachments/:attachmentId`. */
export class RenameTransactionAttachmentDto {
    @ApiProperty({ maxLength: 255, description: "New base name; the server sanitizes it and keeps the extension" })
    @IsString()
    @MaxLength(255)
    fileName: string;
}
