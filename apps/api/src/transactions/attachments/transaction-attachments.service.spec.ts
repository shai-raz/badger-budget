import {
    BadRequestException,
    ConflictException,
    NotFoundException,
    ServiceUnavailableException,
    UnsupportedMediaTypeException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../../prisma/prisma.service";
import { AttachmentStorageService } from "./attachment-storage.service";
import { TransactionAttachmentsService } from "./transaction-attachments.service";
import type { UploadedAttachmentFile } from "./uploaded-attachment-file";

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00]);
const PDF = Buffer.from("%PDF-1.7\n%\xe2\xe3\xcf\xd3\n", "latin1");
const GIF = Buffer.from("GIF89a\x01\x00\x01\x00", "latin1");
const OBJECT_KEY_PATTERN = /^attachments\/user-1\/[0-9a-f-]{36}$/;

function upload(originalname: string, buffer: Buffer, mimetype = "image/jpeg"): UploadedAttachmentFile {
    return { buffer, originalname, size: buffer.length, mimetype };
}

describe("TransactionAttachmentsService", () => {
    let service: TransactionAttachmentsService;
    let storage: { assertEnabled: jest.Mock; putObject: jest.Mock; deleteObjects: jest.Mock };

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
            assertEnabled: jest.fn(),
            putObject: jest.fn().mockResolvedValue(undefined),
            deleteObjects: jest.fn().mockResolvedValue(undefined),
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
    });

    describe("upload", () => {
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
                    createdAt: new Date("2026-10-01"),
                    updatedAt: new Date("2026-10-01"),
                },
            ]);
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
