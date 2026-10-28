import {
    BadRequestException,
    ConflictException,
    InternalServerErrorException,
    NotFoundException,
    ServiceUnavailableException,
    UnsupportedMediaTypeException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../../prisma/prisma.service";
import { generateAttachmentThumbnail } from "./attachment-thumbnail";
import { AttachmentStorageService } from "./attachment-storage.service";
import { TransactionAttachmentsService } from "./transaction-attachments.service";
import type { UploadedAttachmentFile } from "./uploaded-attachment-file";

jest.mock("./attachment-thumbnail");

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00]);
const PDF = Buffer.from("%PDF-1.7\n%\xe2\xe3\xcf\xd3\n", "latin1");
const GIF = Buffer.from("GIF89a\x01\x00\x01\x00", "latin1");
const OBJECT_KEY_PATTERN = /^attachments\/user-1\/[0-9a-f-]{36}$/;

function upload(originalname: string, buffer: Buffer, mimetype = "image/jpeg"): UploadedAttachmentFile {
    return { buffer, originalname, size: buffer.length, mimetype };
}

function attachmentRow(overrides: { thumbnailKey: string | null }) {
    return {
        id: "a",
        transactionId: "transaction-id",
        userId: "user-1",
        fileName: "a.jpg",
        mimeType: "image/jpeg",
        sizeBytes: 10,
        storageKey: "attachments/user-1/a",
        createdAt: new Date("2026-10-01"),
        updatedAt: new Date("2026-10-01"),
        deletedAt: null,
        ...overrides,
    };
}

describe("TransactionAttachmentsService", () => {
    let service: TransactionAttachmentsService;
    let storage: {
        enabled: boolean;
        assertEnabled: jest.Mock;
        putObject: jest.Mock;
        deleteObjects: jest.Mock;
        presignGetUrl: jest.Mock;
    };

    const mockPrisma = {
        transaction: { findFirst: jest.fn() },
        transactionAttachment: {
            count: jest.fn(),
            create: jest.fn(),
            findFirst: jest.fn(),
            findMany: jest.fn(),
            update: jest.fn(),
        },
        $queryRaw: jest.fn(),
        // Callback form runs against this same mock as the transaction client.
        $transaction: jest.fn((callback: (tx: unknown) => unknown) => callback(mockPrisma)),
    };

    beforeEach(() => {
        jest.clearAllMocks();
        storage = {
            enabled: true,
            assertEnabled: jest.fn(),
            putObject: jest.fn().mockResolvedValue(undefined),
            deleteObjects: jest.fn().mockResolvedValue(undefined),
            presignGetUrl: jest.fn().mockResolvedValue("https://files.example.com/signed"),
        };
        service = new TransactionAttachmentsService(
            mockPrisma as unknown as PrismaService,
            storage as unknown as AttachmentStorageService,
        );

        mockPrisma.transaction.findFirst.mockResolvedValue({ id: "transaction-id", counterpartOfId: null });
        mockPrisma.transactionAttachment.count.mockResolvedValue(0);
        mockPrisma.transactionAttachment.create.mockImplementation(({ data }: { data: object }) =>
            Promise.resolve({
                id: "attachment-id",
                ...data,
                createdAt: new Date("2026-10-27T10:00:00Z"),
                updatedAt: new Date("2026-10-27T10:00:00Z"),
                deletedAt: null,
            }),
        );
        mockPrisma.$queryRaw.mockResolvedValue([{ id: "transaction-id" }]);
        jest.mocked(generateAttachmentThumbnail).mockResolvedValue(null);
    });

    describe("upload", () => {
        it("stores a WebP thumbnail beside an image and records its key", async () => {
            const thumbnail = Buffer.from("webp-bytes");
            jest.mocked(generateAttachmentThumbnail).mockResolvedValue(thumbnail);

            await service.upload("user-1", "transaction-id", upload("receipt.jpg", JPEG));

            const key: string = storage.putObject.mock.calls[0][0];
            expect(generateAttachmentThumbnail).toHaveBeenCalledWith(JPEG);
            expect(storage.putObject).toHaveBeenCalledTimes(2);
            expect(storage.putObject).toHaveBeenNthCalledWith(2, `${key}-thumb`, thumbnail, "image/webp");
            expect(mockPrisma.transactionAttachment.create).toHaveBeenCalledWith({
                data: expect.objectContaining({ storageKey: key, thumbnailKey: `${key}-thumb` }),
            });
            expect(storage.deleteObjects).not.toHaveBeenCalled();
        });

        it("stores only the original and records a null thumbnail key when no thumbnail can be made", async () => {
            jest.mocked(generateAttachmentThumbnail).mockResolvedValue(null);

            const result = await service.upload("user-1", "transaction-id", upload("receipt.jpg", JPEG));

            expect(storage.putObject).toHaveBeenCalledTimes(1);
            expect(mockPrisma.transactionAttachment.create).toHaveBeenCalledWith({
                data: expect.objectContaining({ thumbnailKey: null }),
            });
            expect(result).toMatchObject({ id: "attachment-id", mimeType: "image/jpeg" });
        });

        it("still succeeds without a thumbnail when storing it fails, and removes the partial object", async () => {
            jest.mocked(generateAttachmentThumbnail).mockResolvedValue(Buffer.from("webp-bytes"));
            storage.putObject.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("s3 unavailable"));

            const result = await service.upload("user-1", "transaction-id", upload("receipt.jpg", JPEG));

            const key: string = storage.putObject.mock.calls[0][0];
            expect(result).toMatchObject({ id: "attachment-id", mimeType: "image/jpeg" });
            expect(mockPrisma.transactionAttachment.create).toHaveBeenCalledWith({
                data: expect.objectContaining({ storageKey: key, thumbnailKey: null }),
            });
            expect(storage.deleteObjects).toHaveBeenCalledWith([`${key}-thumb`]);
        });

        it("returns a presigned inline thumbnailUrl when a thumbnail was stored", async () => {
            jest.mocked(generateAttachmentThumbnail).mockResolvedValue(Buffer.from("webp-bytes"));

            const result = await service.upload("user-1", "transaction-id", upload("receipt.jpg", JPEG));

            const key: string = storage.putObject.mock.calls[0][0];
            expect(storage.presignGetUrl).toHaveBeenCalledWith(`${key}-thumb`, {
                contentType: "image/webp",
                contentDisposition: "inline",
            });
            expect(result.thumbnailUrl).toBe("https://files.example.com/signed");
        });

        it("returns a null thumbnailUrl and presigns nothing when no thumbnail was stored", async () => {
            const result = await service.upload("user-1", "transaction-id", upload("receipt.jpg", JPEG));

            expect(result.thumbnailUrl).toBeNull();
            expect(storage.presignGetUrl).not.toHaveBeenCalled();
        });

        it("never tries to make a thumbnail of a PDF", async () => {
            const result = await service.upload("user-1", "transaction-id", upload("statement.pdf", PDF));

            expect(generateAttachmentThumbnail).not.toHaveBeenCalled();
            expect(storage.putObject).toHaveBeenCalledTimes(1);
            expect(mockPrisma.transactionAttachment.create).toHaveBeenCalledWith({
                data: expect.objectContaining({ thumbnailKey: null }),
            });
            expect(result.mimeType).toBe("application/pdf");
        });

        it("deletes both the original and the thumbnail when the row cannot be created", async () => {
            jest.mocked(generateAttachmentThumbnail).mockResolvedValue(Buffer.from("webp-bytes"));
            mockPrisma.transactionAttachment.create.mockRejectedValue(new Error("connection lost"));

            await expect(service.upload("user-1", "transaction-id", upload("receipt.jpg", JPEG))).rejects.toThrow(
                "connection lost",
            );

            const key: string = storage.putObject.mock.calls[0][0];
            expect(storage.deleteObjects).toHaveBeenCalledWith([key, `${key}-thumb`]);
        });

        it("stores the file under a random user-scoped key and returns no storage keys", async () => {
            const result = await service.upload("user-1", "transaction-id", upload("receipt.jpg", JPEG));

            const key: string = storage.putObject.mock.calls[0][0];
            expect(key).toMatch(OBJECT_KEY_PATTERN);
            expect(key).not.toContain("receipt");
            expect(storage.putObject).toHaveBeenCalledWith(key, JPEG, "image/jpeg");

            expect(mockPrisma.transactionAttachment.create).toHaveBeenCalledWith({
                data: {
                    transactionId: "transaction-id",
                    userId: "user-1",
                    fileName: "receipt.jpg",
                    mimeType: "image/jpeg",
                    sizeBytes: JPEG.length,
                    storageKey: key,
                    thumbnailKey: null,
                },
            });
            expect(result).toMatchObject({
                id: "attachment-id",
                transactionId: "transaction-id",
                fileName: "receipt.jpg",
                mimeType: "image/jpeg",
                sizeBytes: JPEG.length,
            });
            expect(result).not.toHaveProperty("storageKey");
            expect(result).not.toHaveProperty("thumbnailKey");
            expect(result).not.toHaveProperty("deletedAt");
        });

        it("takes the stored type from the bytes, not the client name or MIME type", async () => {
            const result = await service.upload("user-1", "transaction-id", upload("x.png", PDF, "image/png"));

            expect(result.mimeType).toBe("application/pdf");
            expect(result.fileName).toBe("x.pdf");
            expect(storage.putObject).toHaveBeenCalledWith(expect.any(String), PDF, "application/pdf");
        });

        it("rejects a GIF named .jpg with 415 before anything is stored", async () => {
            await expect(service.upload("user-1", "transaction-id", upload("x.jpg", GIF))).rejects.toThrow(
                UnsupportedMediaTypeException,
            );

            expect(storage.putObject).not.toHaveBeenCalled();
            expect(mockPrisma.transactionAttachment.create).not.toHaveBeenCalled();
        });

        it("rejects an empty file with 400", async () => {
            await expect(service.upload("user-1", "transaction-id", upload("x.jpg", Buffer.alloc(0)))).rejects.toThrow(
                BadRequestException,
            );
            expect(storage.putObject).not.toHaveBeenCalled();
        });

        it("looks up the transaction by owner and rejects another user's or a missing one with 404", async () => {
            mockPrisma.transaction.findFirst.mockResolvedValue(null);

            await expect(service.upload("other-user", "transaction-id", upload("x.jpg", JPEG))).rejects.toThrow(
                new NotFoundException("Transaction with ID transaction-id not found"),
            );
            expect(mockPrisma.transaction.findFirst).toHaveBeenCalledWith({
                where: { id: "transaction-id", userId: "other-user", deletedAt: null },
                select: { id: true, counterpartOfId: true },
            });
            expect(storage.putObject).not.toHaveBeenCalled();
        });

        it("rejects a transfer mirror entry with 400", async () => {
            mockPrisma.transaction.findFirst.mockResolvedValue({ id: "mirror-id", counterpartOfId: "source-id" });

            await expect(service.upload("user-1", "mirror-id", upload("x.jpg", JPEG))).rejects.toThrow(
                new BadRequestException(
                    "Attachments can't be added to a linked transfer entry. Add them to the source transaction.",
                ),
            );
            expect(storage.putObject).not.toHaveBeenCalled();
        });

        it("rejects an eleventh attachment with 409 before anything is stored", async () => {
            mockPrisma.transactionAttachment.count.mockResolvedValue(10);

            await expect(service.upload("user-1", "transaction-id", upload("x.jpg", JPEG))).rejects.toThrow(
                new ConflictException("A transaction can have at most 10 attachments"),
            );
            expect(storage.putObject).not.toHaveBeenCalled();
        });

        it("rechecks the count under the row lock and deletes the stored object on 409", async () => {
            mockPrisma.transactionAttachment.count.mockResolvedValueOnce(9).mockResolvedValueOnce(10);

            await expect(service.upload("user-1", "transaction-id", upload("x.jpg", JPEG))).rejects.toThrow(
                ConflictException,
            );

            const key: string = storage.putObject.mock.calls[0][0];
            expect(mockPrisma.transactionAttachment.create).not.toHaveBeenCalled();
            expect(storage.deleteObjects).toHaveBeenCalledWith([key]);
        });

        it("deletes the stored object when the row cannot be created", async () => {
            mockPrisma.transactionAttachment.create.mockRejectedValue(new Error("connection lost"));

            await expect(service.upload("user-1", "transaction-id", upload("x.jpg", JPEG))).rejects.toThrow(
                "connection lost",
            );

            const key: string = storage.putObject.mock.calls[0][0];
            expect(storage.deleteObjects).toHaveBeenCalledWith([key]);
        });

        it("decodes a latin1-mangled multipart name back to UTF-8 Hebrew", async () => {
            const mangled = Buffer.from("קבלה.jpg", "utf8").toString("latin1");

            const result = await service.upload("user-1", "transaction-id", upload(mangled, JPEG));

            expect(result.fileName).toBe("קבלה.jpg");
            expect(mockPrisma.transactionAttachment.create).toHaveBeenCalledWith(
                expect.objectContaining({ data: expect.objectContaining({ fileName: "קבלה.jpg" }) }),
            );
        });

        it("keeps a name busboy already decoded when it has characters above U+00FF", async () => {
            const result = await service.upload("user-1", "transaction-id", upload("receipt €.jpg", JPEG));

            expect(result.fileName).toBe("receipt €.jpg");
        });

        it("keeps a pure-latin1 name whose bytes are not valid UTF-8", async () => {
            // "é" as one latin1 byte (0xE9) is not a valid UTF-8 sequence on its own.
            const result = await service.upload("user-1", "transaction-id", upload("café.jpg", JPEG));

            expect(result.fileName).toBe("café.jpg");
            expect(result.fileName).not.toContain("�");
        });

        it("fails with 503 and touches nothing when storage is disabled", async () => {
            const disabled = new AttachmentStorageService({ get: () => undefined } as unknown as ConfigService);
            const disabledService = new TransactionAttachmentsService(mockPrisma as unknown as PrismaService, disabled);

            await expect(disabledService.upload("user-1", "transaction-id", upload("x.jpg", JPEG))).rejects.toThrow(
                ServiceUnavailableException,
            );
            expect(mockPrisma.transaction.findFirst).not.toHaveBeenCalled();
        });
    });

    describe("remove", () => {
        it("soft-deletes the row and deletes its file and thumbnail objects", async () => {
            mockPrisma.transactionAttachment.findFirst.mockResolvedValue({
                id: "attachment-id",
                storageKey: "attachments/user-1/abc",
                thumbnailKey: "attachments/user-1/abc-thumb",
            });

            await service.remove("user-1", "transaction-id", "attachment-id");

            expect(mockPrisma.transactionAttachment.findFirst).toHaveBeenCalledWith({
                where: { id: "attachment-id", transactionId: "transaction-id", userId: "user-1", deletedAt: null },
                select: { id: true, storageKey: true, thumbnailKey: true },
            });
            expect(mockPrisma.transactionAttachment.update).toHaveBeenCalledWith({
                where: { id: "attachment-id" },
                data: { deletedAt: expect.any(Date) },
            });
            expect(storage.deleteObjects).toHaveBeenCalledWith([
                "attachments/user-1/abc",
                "attachments/user-1/abc-thumb",
            ]);
        });

        it("returns 404 for another user's attachment and changes nothing", async () => {
            mockPrisma.transactionAttachment.findFirst.mockResolvedValue(null);

            await expect(service.remove("other-user", "transaction-id", "attachment-id")).rejects.toThrow(
                NotFoundException,
            );
            expect(mockPrisma.transactionAttachment.update).not.toHaveBeenCalled();
            expect(storage.deleteObjects).not.toHaveBeenCalled();
        });
    });

    describe("listForTransaction", () => {
        it("returns live rows oldest first without storage keys", async () => {
            mockPrisma.transactionAttachment.findMany.mockResolvedValue([
                {
                    id: "a",
                    transactionId: "transaction-id",
                    userId: "user-1",
                    fileName: "a.pdf",
                    mimeType: "application/pdf",
                    sizeBytes: 10,
                    storageKey: "attachments/user-1/a",
                    thumbnailKey: null,
                    createdAt: new Date("2026-10-01"),
                    updatedAt: new Date("2026-10-01"),
                    deletedAt: null,
                },
            ]);

            const result = await service.listForTransaction("transaction-id");

            expect(mockPrisma.transactionAttachment.findMany).toHaveBeenCalledWith({
                where: { transactionId: "transaction-id", deletedAt: null },
                orderBy: { createdAt: "asc" },
            });
            expect(result).toEqual([
                {
                    id: "a",
                    transactionId: "transaction-id",
                    fileName: "a.pdf",
                    mimeType: "application/pdf",
                    sizeBytes: 10,
                    thumbnailUrl: null,
                    createdAt: new Date("2026-10-01"),
                    updatedAt: new Date("2026-10-01"),
                },
            ]);
        });

        it("sets thumbnailUrl to a presigned inline WebP URL when the row has a thumbnail", async () => {
            mockPrisma.transactionAttachment.findMany.mockResolvedValue([
                attachmentRow({ thumbnailKey: "attachments/user-1/a-thumb" }),
            ]);

            const [result] = await service.listForTransaction("transaction-id");

            expect(storage.presignGetUrl).toHaveBeenCalledWith("attachments/user-1/a-thumb", {
                contentType: "image/webp",
                contentDisposition: "inline",
            });
            expect(result.thumbnailUrl).toBe("https://files.example.com/signed");
        });

        it("sets thumbnailUrl to null without presigning when storage is disabled", async () => {
            storage.enabled = false;
            mockPrisma.transactionAttachment.findMany.mockResolvedValue([
                attachmentRow({ thumbnailKey: "attachments/user-1/a-thumb" }),
            ]);

            const [result] = await service.listForTransaction("transaction-id");

            expect(result.thumbnailUrl).toBeNull();
            expect(storage.presignGetUrl).not.toHaveBeenCalled();
        });
    });

    describe("getUrl", () => {
        const KEY = "attachments/user-1/abc";

        beforeEach(() => {
            mockPrisma.transactionAttachment.findFirst.mockResolvedValue({
                storageKey: KEY,
                mimeType: "application/pdf",
                fileName: "statement.pdf",
            });
        });

        afterEach(() => {
            jest.useRealTimers();
        });

        it("presigns the stored key with the stored type and an inline disposition", async () => {
            await service.getUrl("user-1", "transaction-id", "attachment-id", "inline");

            expect(mockPrisma.transactionAttachment.findFirst).toHaveBeenCalledWith({
                where: { id: "attachment-id", transactionId: "transaction-id", userId: "user-1", deletedAt: null },
                select: { storageKey: true, mimeType: true, fileName: true },
            });
            expect(storage.presignGetUrl).toHaveBeenCalledWith(KEY, {
                contentType: "application/pdf",
                contentDisposition: "inline",
            });
        });

        it("uses an attachment disposition with the display name when downloading", async () => {
            await service.getUrl("user-1", "transaction-id", "attachment-id", "attachment");

            expect(storage.presignGetUrl).toHaveBeenCalledWith(KEY, {
                contentType: "application/pdf",
                contentDisposition: `attachment; filename="statement.pdf"; filename*=UTF-8''statement.pdf`,
            });
        });

        it("returns the signed URL and an expiry one hour from now", async () => {
            jest.useFakeTimers().setSystemTime(new Date("2026-10-28T10:00:00.000Z"));

            const result = await service.getUrl("user-1", "transaction-id", "attachment-id", "inline");

            expect(result).toEqual({
                url: "https://files.example.com/signed",
                expiresAt: "2026-10-28T11:00:00.000Z",
            });
        });

        it("returns 404 for another user's attachment and signs nothing", async () => {
            mockPrisma.transactionAttachment.findFirst.mockResolvedValue(null);

            await expect(service.getUrl("other-user", "transaction-id", "attachment-id", "inline")).rejects.toThrow(
                new NotFoundException("Attachment with ID attachment-id not found"),
            );
            expect(storage.presignGetUrl).not.toHaveBeenCalled();
        });

        it("fails with 503 and reads nothing when storage is disabled", async () => {
            const disabled = new AttachmentStorageService({ get: () => undefined } as unknown as ConfigService);
            const disabledService = new TransactionAttachmentsService(mockPrisma as unknown as PrismaService, disabled);

            await expect(disabledService.getUrl("user-1", "transaction-id", "attachment-id", "inline")).rejects.toThrow(
                ServiceUnavailableException,
            );
            expect(mockPrisma.transactionAttachment.findFirst).not.toHaveBeenCalled();
        });
    });

    describe("rename", () => {
        const PDF_ROW = { ...attachmentRow({ thumbnailKey: null }), mimeType: "application/pdf", fileName: "a.pdf" };

        beforeEach(() => {
            mockPrisma.transactionAttachment.findFirst.mockResolvedValue(PDF_ROW);
            mockPrisma.transactionAttachment.update.mockImplementation(({ data }: { data: { fileName: string } }) =>
                Promise.resolve({ ...PDF_ROW, fileName: data.fileName }),
            );
        });

        it("keeps the stored extension when the new name has none", async () => {
            const result = await service.rename("user-1", "transaction-id", "a", "new name");

            expect(mockPrisma.transactionAttachment.update).toHaveBeenCalledWith({
                where: { id: "a" },
                data: { fileName: "new name.pdf" },
            });
            expect(result).toMatchObject({ id: "a", fileName: "new name.pdf", thumbnailUrl: null });
        });

        it("does not double the extension when the new name already ends with it", async () => {
            await service.rename("user-1", "transaction-id", "a", "foo.pdf");

            expect(mockPrisma.transactionAttachment.update).toHaveBeenCalledWith({
                where: { id: "a" },
                data: { fileName: "foo.pdf" },
            });
        });

        it("strips reserved characters from the new name", async () => {
            await service.rename("user-1", "transaction-id", "a", 'a/b:c*?"<>|d');

            expect(mockPrisma.transactionAttachment.update).toHaveBeenCalledWith({
                where: { id: "a" },
                data: { fileName: "abcd.pdf" },
            });
        });

        it("keeps Hebrew characters", async () => {
            await service.rename("user-1", "transaction-id", "a", "חשבונית מס");

            expect(mockPrisma.transactionAttachment.update).toHaveBeenCalledWith({
                where: { id: "a" },
                data: { fileName: "חשבונית מס.pdf" },
            });
        });

        it("returns 400 'Enter a name' when nothing is left after sanitizing, and writes nothing", async () => {
            await expect(service.rename("user-1", "transaction-id", "a", "***")).rejects.toThrow(
                new BadRequestException("Enter a name"),
            );
            expect(mockPrisma.transactionAttachment.update).not.toHaveBeenCalled();
        });

        it("returns 404 for another user's attachment and writes nothing", async () => {
            mockPrisma.transactionAttachment.findFirst.mockResolvedValue(null);

            await expect(service.rename("other-user", "transaction-id", "a", "new name")).rejects.toThrow(
                new NotFoundException("Attachment with ID a not found"),
            );
            expect(mockPrisma.transactionAttachment.findFirst).toHaveBeenCalledWith({
                where: { id: "a", transactionId: "transaction-id", userId: "other-user", deletedAt: null },
            });
            expect(mockPrisma.transactionAttachment.update).not.toHaveBeenCalled();
        });

        it("fails with 500 when the stored MIME type is not an accepted one", async () => {
            mockPrisma.transactionAttachment.findFirst.mockResolvedValue({ ...PDF_ROW, mimeType: "image/gif" });

            await expect(service.rename("user-1", "transaction-id", "a", "new name")).rejects.toThrow(
                InternalServerErrorException,
            );
            expect(mockPrisma.transactionAttachment.update).not.toHaveBeenCalled();
        });

        it("renames without checking storage or signing URLs when storage is disabled", async () => {
            storage.enabled = false;

            const result = await service.rename("user-1", "transaction-id", "a", "new name");

            expect(storage.assertEnabled).not.toHaveBeenCalled();
            expect(storage.presignGetUrl).not.toHaveBeenCalled();
            expect(result.fileName).toBe("new name.pdf");
        });
    });

    describe("deleteObjectsForRows", () => {
        it("includes the thumbnail key only when there is one", async () => {
            await service.deleteObjectsForRows([
                { storageKey: "attachments/user-1/a", thumbnailKey: null },
                { storageKey: "attachments/user-1/b", thumbnailKey: "attachments/user-1/b-thumb" },
            ]);

            expect(storage.deleteObjects).toHaveBeenCalledWith([
                "attachments/user-1/a",
                "attachments/user-1/b",
                "attachments/user-1/b-thumb",
            ]);
        });
    });
});
