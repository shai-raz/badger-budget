import { ApiProperty } from "@nestjs/swagger";
import { IsIn } from "class-validator";
import { ATTACHMENT_DISPOSITIONS, type AttachmentDisposition } from "@badger/shared-data";

/** Query params for `GET /transactions/:id/attachments/:attachmentId/url`. */
export class AttachmentUrlQueryDto {
    @ApiProperty({ enum: [...ATTACHMENT_DISPOSITIONS] })
    @IsIn([...ATTACHMENT_DISPOSITIONS])
    disposition: AttachmentDisposition;
}
