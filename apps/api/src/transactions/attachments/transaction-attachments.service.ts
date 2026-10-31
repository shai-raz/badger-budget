import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
    UnsupportedMediaTypeException,
} from "@nestjs/common";
import type { TransactionAttachment } from "@prisma/client";
import { ATTACHMENT_MAX_PER_TRANSACTION, isAttachmentMimeType } from "@badger/shared-data";
import { sanitizeAttachmentFileName } from "@badger/utils";
import { PrismaService } from "../../prisma/prisma.service";
import { TransactionAttachmentResponseDto } from "../dto/transaction-attachment-response.dto";
import { AttachmentStorageService } from "./attachment-storage.service";
import { newAttachmentObjectKey } from "./attachment-keys";
import { detectAttachmentType } from "./detect-file-type";
import type { UploadedAttachmentFile } from "./uploaded-attachment-file";

type AttachmentRowFields = Pick<
    TransactionAttachment,
    "id" | "transactionId" | "fileName" | "mimeType" | "sizeBytes" | "createdAt" | "updatedAt"
>;

/**
 * busboy decodes multipart file names as latin1, which garbles non-ASCII (Hebrew) names sent as UTF-8 bytes. Re-decode
 * only when the name is pure latin1 and its bytes are valid UTF-8. A name busboy already decoded (RFC 5987 filename*,
 * or any character above U+00FF) is returned as is.
 */
function decodeMultipartFileName(raw: string): string {
    if (Buffer.from(raw, "latin1").toString("latin1") !== raw) return raw;
    const decoded = Buffer.from(raw, "latin1").toString("utf8");
    return decoded.includes("�") ? raw : decoded;
}

/** Uploads and removes transaction attachment files. Object keys stay server-side and are never returned. */
@Injectable()
export class TransactionAttachmentsService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly storage: AttachmentStorageService,
    ) {}

    async upload(
        userId: string,
        transactionId: string,
        file: UploadedAttachmentFile,
    ): Promise<TransactionAttachmentResponseDto> {
        this.storage.assertEnabled();

        const transaction = await this.prisma.transaction.findFirst({
            where: { id: transactionId, userId, deletedAt: null },
            select: { id: true, counterpartOfId: true },
        });
        if (!transaction) {
            throw new NotFoundException(`Transaction with ID ${transactionId} not found`);
        }
        if (transaction.counterpartOfId !== null) {
            throw new BadRequestException(
                "Attachments can't be added to a linked transfer entry. Add them to the source transaction.",
            );
        }

        const liveCount = await this.prisma.transactionAttachment.count({
            where: { transactionId, deletedAt: null },
        });
        if (liveCount >= ATTACHMENT_MAX_PER_TRANSACTION) {
            throw new ConflictException(`A transaction can have at most ${ATTACHMENT_MAX_PER_TRANSACTION} attachments`);
        }

        if (file.buffer.length === 0) {
            throw new BadRequestException("The uploaded file is empty");
        }
        const detected = detectAttachmentType(file.buffer);
        if (!detected) {
            throw new UnsupportedMediaTypeException("Only JPEG, PNG, WebP or PDF files are allowed");
        }

        const fileName = sanitizeAttachmentFileName(decodeMultipartFileName(file.originalname), detected.ext);

        const key = newAttachmentObjectKey(userId);
        // Recorded before the put so that a put which fails after writing the object is still cleaned up.
        const written: string[] = [key];
        try {
            await this.storage.putObject(key, file.buffer, detected.mime);

            // The row lock serializes concurrent uploads and a concurrent delete of the transaction. If the delete
            // committed first, the lock finds no live row and this returns 404. Otherwise the delete waits for this
            // commit and soft-deletes the new row along with the transaction.
            return await this.prisma.$transaction(async (tx) => {
                const locked = await tx.$queryRaw<{ id: string }[]>`
                    SELECT id FROM transactions
                    WHERE id = ${transactionId}::uuid AND user_id = ${userId}::uuid AND deleted_at IS NULL
                    FOR UPDATE`;
                if (locked.length === 0) {
                    throw new NotFoundException(`Transaction with ID ${transactionId} not found`);
                }

                const count = await tx.transactionAttachment.count({ where: { transactionId, deletedAt: null } });
                if (count >= ATTACHMENT_MAX_PER_TRANSACTION) {
                    throw new ConflictException(
                        `A transaction can have at most ${ATTACHMENT_MAX_PER_TRANSACTION} attachments`,
                    );
                }

                const row = await tx.transactionAttachment.create({
                    data: {
                        transactionId,
                        userId,
                        fileName,
                        mimeType: detected.mime,
                        sizeBytes: file.buffer.length,
                        storageKey: key,
                        thumbnailKey: null,
                    },
                });
                return this.toResponse(row);
            });
        } catch (error) {
            await this.storage.deleteObjects(written);
            throw error;
        }
    }

    async remove(userId: string, transactionId: string, attachmentId: string): Promise<void> {
        const row = await this.prisma.transactionAttachment.findFirst({
            where: { id: attachmentId, transactionId, userId, deletedAt: null },
            select: { id: true, storageKey: true, thumbnailKey: true },
        });
        if (!row) {
            throw new NotFoundException(`Attachment with ID ${attachmentId} not found`);
        }

        await this.prisma.transactionAttachment.update({
            where: { id: attachmentId },
            data: { deletedAt: new Date() },
        });
        await this.deleteObjectsForRows([row]);
    }

    async listForTransaction(transactionId: string): Promise<TransactionAttachmentResponseDto[]> {
        const rows = await this.prisma.transactionAttachment.findMany({
            where: { transactionId, deletedAt: null },
            orderBy: { createdAt: "asc" },
        });
        return rows.map((row) => this.toResponse(row));
    }

    /** Best effort: deletes each row's file and thumbnail objects. Storage failures are logged, never thrown. */
    async deleteObjectsForRows(rows: { storageKey: string; thumbnailKey: string | null }[]): Promise<void> {
        const keys = rows.flatMap((row) =>
            row.thumbnailKey === null ? [row.storageKey] : [row.storageKey, row.thumbnailKey],
        );
        await this.storage.deleteObjects(keys);
    }

    private toResponse(row: AttachmentRowFields): TransactionAttachmentResponseDto {
        if (!isAttachmentMimeType(row.mimeType)) {
            throw new Error(`Attachment ${row.id} has an unexpected MIME type`);
        }
        return {
            id: row.id,
            transactionId: row.transactionId,
            fileName: row.fileName,
            mimeType: row.mimeType,
            sizeBytes: row.sizeBytes,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
        };
    }
}
