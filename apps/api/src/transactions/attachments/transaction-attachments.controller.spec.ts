import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { ThrottlerModule } from "@nestjs/throttler";
import request from "supertest";
import { ATTACHMENT_MAX_BYTES, DEMO_EMAIL } from "@badger/shared-data";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { AttachmentStorageService } from "./attachment-storage.service";
import { TransactionAttachmentsController } from "./transaction-attachments.controller";
import { TransactionAttachmentsService } from "./transaction-attachments.service";

const TRANSACTION_ID = "3f2c8a1e-6b1d-4c9e-8f7a-1234567890ab";
const ATTACHMENT_ID = "9a8b7c6d-5e4f-4a3b-8c2d-0f1e2d3c4b5a";
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00]);

describe("TransactionAttachmentsController", () => {
    let app: INestApplication;
    let currentUser: { id: string; email: string };
    let storage: { enabled: boolean };
    let service: { upload: jest.Mock; rename: jest.Mock; remove: jest.Mock; getUrl: jest.Mock };

    beforeEach(async () => {
        currentUser = { id: "user-1", email: "user@example.com" };
        storage = { enabled: true };
        service = {
            upload: jest.fn(async (_userId: string, _transactionId: string, file: { originalname: string }) => ({
                id: ATTACHMENT_ID,
                transactionId: TRANSACTION_ID,
                fileName: file.originalname,
                mimeType: "image/jpeg",
                sizeBytes: JPEG.length,
                createdAt: new Date(),
                updatedAt: new Date(),
            })),
            rename: jest.fn(async (_userId: string, _transactionId: string, _attachmentId: string, name: string) => ({
                id: ATTACHMENT_ID,
                transactionId: TRANSACTION_ID,
                fileName: `${name}.jpg`,
                mimeType: "image/jpeg",
                sizeBytes: JPEG.length,
                thumbnailUrl: null,
                createdAt: new Date(),
                updatedAt: new Date(),
            })),
            remove: jest.fn().mockResolvedValue(undefined),
            getUrl: jest.fn().mockResolvedValue({
                url: "https://files.example.com/signed",
                expiresAt: "2026-10-28T11:00:00.000Z",
            }),
        };

        const moduleRef = await Test.createTestingModule({
            imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 30 }])],
            controllers: [TransactionAttachmentsController],
            providers: [
                { provide: TransactionAttachmentsService, useValue: service },
                { provide: AttachmentStorageService, useValue: storage },
            ],
        })
            .overrideGuard(JwtAuthGuard)
            .useValue({
                canActivate: (context: { switchToHttp: () => { getRequest: () => { user?: unknown } } }) => {
                    context.switchToHttp().getRequest().user = currentUser;
                    return true;
                },
            })
            .compile();

        app = moduleRef.createNestApplication();
        // Same validation as app.setup.ts, so query DTOs are checked here as they are in production.
        app.useGlobalPipes(
            new ValidationPipe({
                whitelist: true,
                forbidNonWhitelisted: true,
                transform: true,
                transformOptions: { enableImplicitConversion: true },
            }),
        );
        await app.init();
    });

    afterEach(async () => {
        await app.close();
    });

    const uploadPath = `/transactions/${TRANSACTION_ID}/attachments`;

    it("uploads the file for the signed-in user and transaction", async () => {
        const response = await request(app.getHttpServer()).post(uploadPath).attach("file", JPEG, "receipt.jpg");

        expect(response.status).toBe(201);
        expect(response.body).toMatchObject({ id: ATTACHMENT_ID, fileName: "receipt.jpg" });
        expect(service.upload).toHaveBeenCalledTimes(1);
        const [userId, transactionId, file] = service.upload.mock.calls[0];
        expect(userId).toBe("user-1");
        expect(transactionId).toBe(TRANSACTION_ID);
        expect(file.buffer.length).toBe(JPEG.length);
        expect(file.originalname).toBe("receipt.jpg");
    });

    it("rejects a file over the size limit with 413 before the service runs", async () => {
        const response = await request(app.getHttpServer())
            .post(uploadPath)
            .attach("file", Buffer.alloc(ATTACHMENT_MAX_BYTES + 1), "big.pdf");

        expect(response.status).toBe(413);
        expect(service.upload).not.toHaveBeenCalled();
    });

    it("returns 503 when file storage is not configured, without calling the service", async () => {
        storage.enabled = false;

        const response = await request(app.getHttpServer()).post(uploadPath).attach("file", JPEG, "receipt.jpg");

        expect(response.status).toBe(503);
        expect(response.body.message).toBe("File storage isn't configured on this server");
        expect(service.upload).not.toHaveBeenCalled();
    });

    it("returns 403 for the demo account, without calling the service", async () => {
        currentUser = { id: "demo-id", email: DEMO_EMAIL };

        const response = await request(app.getHttpServer()).post(uploadPath).attach("file", JPEG, "receipt.jpg");

        expect(response.status).toBe(403);
        expect(service.upload).not.toHaveBeenCalled();
    });

    it("returns 400 when the multipart body has no file field", async () => {
        const response = await request(app.getHttpServer()).post(uploadPath).field("note", "no file here");

        expect(response.status).toBe(400);
        expect(response.body.message).toBe("Choose a file to upload");
        expect(service.upload).not.toHaveBeenCalled();
    });

    it("returns 400 for a transaction id that is not a uuid", async () => {
        const response = await request(app.getHttpServer())
            .post("/transactions/not-a-uuid/attachments")
            .attach("file", JPEG, "receipt.jpg");

        expect(response.status).toBe(400);
        expect(service.upload).not.toHaveBeenCalled();
    });

    describe("PATCH attachment", () => {
        const itemPath = `${uploadPath}/${ATTACHMENT_ID}`;

        it("renames the attachment for the signed-in user and returns it", async () => {
            const response = await request(app.getHttpServer()).patch(itemPath).send({ fileName: "new name" });

            expect(response.status).toBe(200);
            expect(response.body).toMatchObject({ id: ATTACHMENT_ID, fileName: "new name.jpg" });
            expect(service.rename).toHaveBeenCalledWith("user-1", TRANSACTION_ID, ATTACHMENT_ID, "new name");
        });

        it("returns 400 when fileName is missing, without calling the service", async () => {
            const response = await request(app.getHttpServer()).patch(itemPath).send({});

            expect(response.status).toBe(400);
            expect(service.rename).not.toHaveBeenCalled();
        });

        it("returns 400 for an attachment id that is not a uuid, without calling the service", async () => {
            const response = await request(app.getHttpServer())
                .patch(`${uploadPath}/not-a-uuid`)
                .send({ fileName: "new name" });

            expect(response.status).toBe(400);
            expect(service.rename).not.toHaveBeenCalled();
        });
    });

    it("deletes an attachment for the signed-in user", async () => {
        const response = await request(app.getHttpServer()).delete(`${uploadPath}/${ATTACHMENT_ID}`);

        expect(response.status).toBe(204);
        expect(service.remove).toHaveBeenCalledWith("user-1", TRANSACTION_ID, ATTACHMENT_ID);
    });

    describe("GET attachment URL", () => {
        const urlPath = `${uploadPath}/${ATTACHMENT_ID}/url`;

        it("returns the presigned URL for the signed-in user, attachment and disposition", async () => {
            const response = await request(app.getHttpServer()).get(urlPath).query({ disposition: "inline" });

            expect(response.status).toBe(200);
            expect(response.body).toEqual({
                url: "https://files.example.com/signed",
                expiresAt: "2026-10-28T11:00:00.000Z",
            });
            expect(service.getUrl).toHaveBeenCalledWith("user-1", TRANSACTION_ID, ATTACHMENT_ID, "inline");
        });

        it("passes the attachment disposition through", async () => {
            await request(app.getHttpServer()).get(urlPath).query({ disposition: "attachment" });

            expect(service.getUrl).toHaveBeenCalledWith("user-1", TRANSACTION_ID, ATTACHMENT_ID, "attachment");
        });

        it("returns 400 for a disposition that is not inline or attachment, without calling the service", async () => {
            const response = await request(app.getHttpServer()).get(urlPath).query({ disposition: "script" });

            expect(response.status).toBe(400);
            expect(service.getUrl).not.toHaveBeenCalled();
        });

        it("returns 400 when the disposition is missing", async () => {
            const response = await request(app.getHttpServer()).get(urlPath);

            expect(response.status).toBe(400);
            expect(service.getUrl).not.toHaveBeenCalled();
        });

        it("returns 400 for an attachment id that is not a uuid", async () => {
            const response = await request(app.getHttpServer())
                .get(`${uploadPath}/not-a-uuid/url`)
                .query({ disposition: "inline" });

            expect(response.status).toBe(400);
            expect(service.getUrl).not.toHaveBeenCalled();
        });
    });

    it("returns 400 for an attachment id that is not a uuid on delete", async () => {
        const response = await request(app.getHttpServer()).delete(`${uploadPath}/not-a-uuid`);

        expect(response.status).toBe(400);
        expect(service.remove).not.toHaveBeenCalled();
    });
});
