import {
    BadRequestException,
    Controller,
    Delete,
    HttpCode,
    HttpStatus,
    Param,
    ParseUUIDPipe,
    Post,
    UseGuards,
    UseInterceptors,
    UploadedFile,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiResponse, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { ATTACHMENT_MAX_BYTES } from "@badger/shared-data";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../../auth/decorators/current-user.decorator";
import { TransactionAttachmentResponseDto } from "../dto/transaction-attachment-response.dto";
import { AttachmentUploadGuard } from "./attachment-upload.guard";
import { AttachmentUploadThrottlerGuard } from "./attachment-upload-throttler.guard";
import { TransactionAttachmentsService } from "./transaction-attachments.service";
import type { UploadedAttachmentFile } from "./uploaded-attachment-file";

@ApiTags("transactions")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("transactions/:id/attachments")
export class TransactionAttachmentsController {
    constructor(private readonly attachments: TransactionAttachmentsService) {}

    @Post()
    // Guards run before FileInterceptor, so a disabled server or demo account is rejected without reading the body.
    @UseGuards(AttachmentUploadGuard, AttachmentUploadThrottlerGuard)
    // Allows a 10-file burst plus retries.
    @Throttle({ default: { limit: 30, ttl: 60_000 } })
    // No `storage` option: multer keeps the file in memory and nothing is written to disk. multer aborts at fileSize
    // mid-stream, and Nest turns that into a 413.
    @UseInterceptors(
        FileInterceptor("file", {
            limits: {
                fileSize: ATTACHMENT_MAX_BYTES,
                files: 1,
                fields: 5,
                parts: 6,
                fieldSize: 1024,
            },
        }),
    )
    @ApiConsumes("multipart/form-data")
    @ApiBody({
        schema: {
            type: "object",
            required: ["file"],
            properties: { file: { type: "string", format: "binary" } },
        },
    })
    @ApiResponse({ status: 201, description: "Attachment uploaded", type: TransactionAttachmentResponseDto })
    @ApiResponse({ status: 400, description: "No file was sent, or the file is empty" })
    @ApiResponse({ status: 403, description: "Uploads are disabled on the demo account" })
    @ApiResponse({ status: 404, description: "Transaction not found" })
    @ApiResponse({ status: 409, description: "The transaction already has the maximum number of attachments" })
    @ApiResponse({ status: 413, description: "The file is larger than the size limit" })
    @ApiResponse({ status: 415, description: "The file type isn't JPEG, PNG, WebP or PDF" })
    @ApiResponse({ status: 503, description: "File storage isn't configured on this server" })
    upload(
        @Param("id", ParseUUIDPipe) id: string,
        @UploadedFile() file: UploadedAttachmentFile | undefined,
        @CurrentUser() user: any,
    ): Promise<TransactionAttachmentResponseDto> {
        if (!file) {
            throw new BadRequestException("Choose a file to upload");
        }
        return this.attachments.upload(user.id, id, file);
    }

    @Delete(":attachmentId")
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiResponse({ status: 204, description: "Attachment deleted" })
    @ApiResponse({ status: 404, description: "Attachment not found" })
    remove(
        @Param("id", ParseUUIDPipe) id: string,
        @Param("attachmentId", ParseUUIDPipe) attachmentId: string,
        @CurrentUser() user: any,
    ): Promise<void> {
        return this.attachments.remove(user.id, id, attachmentId);
    }
}
