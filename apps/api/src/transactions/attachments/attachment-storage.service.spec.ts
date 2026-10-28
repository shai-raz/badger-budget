import { Logger, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { AttachmentStorageService } from "./attachment-storage.service";

jest.mock("@aws-sdk/client-s3", () => {
    const actual = jest.requireActual<typeof import("@aws-sdk/client-s3")>("@aws-sdk/client-s3");
    return { ...actual, S3Client: jest.fn() };
});

jest.mock("@aws-sdk/s3-request-presigner", () => ({ getSignedUrl: jest.fn() }));

const SETTINGS = {
    ATTACHMENTS_S3_ENDPOINT: "https://s3.example.com",
    ATTACHMENTS_S3_BUCKET: "receipts",
    ATTACHMENTS_S3_ACCESS_KEY_ID: "access-key-id",
    ATTACHMENTS_S3_SECRET_ACCESS_KEY: "secret-value",
};

const NOT_CONFIGURED_MESSAGE = "File storage isn't configured on this server";

function createService(env: Record<string, string | undefined>): AttachmentStorageService {
    const config = { get: jest.fn((key: string) => env[key]) } as unknown as ConfigService;
    return new AttachmentStorageService(config);
}

describe("AttachmentStorageService", () => {
    let send: jest.Mock;
    let warn: jest.SpyInstance;

    beforeEach(() => {
        send = jest.fn().mockResolvedValue({});
        jest.mocked(S3Client).mockReset();
        jest.mocked(S3Client).mockImplementation(() => ({ send }) as unknown as S3Client);
        jest.mocked(getSignedUrl).mockReset();
        warn = jest.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe("when configured", () => {
        it("builds the S3 client with path-style addressing and checksums only when required", () => {
            createService(SETTINGS);

            expect(S3Client).toHaveBeenCalledWith({
                region: "auto",
                endpoint: "https://s3.example.com",
                credentials: { accessKeyId: "access-key-id", secretAccessKey: "secret-value" },
                forcePathStyle: true,
                requestChecksumCalculation: "WHEN_REQUIRED",
                responseChecksumValidation: "WHEN_REQUIRED",
            });
        });

        it("is enabled", () => {
            expect(createService(SETTINGS).enabled).toBe(true);
        });

        it("builds a second client for signing against the public endpoint", () => {
            createService({ ...SETTINGS, ATTACHMENTS_S3_PUBLIC_ENDPOINT: "https://files.example.com" });

            expect(S3Client).toHaveBeenCalledTimes(2);
            expect(jest.mocked(S3Client).mock.calls[1][0]).toEqual(
                expect.objectContaining({
                    endpoint: "https://files.example.com",
                    forcePathStyle: true,
                    requestChecksumCalculation: "WHEN_REQUIRED",
                }),
            );
        });

        it("presignGetUrl signs a GET with the response headers and the one-hour TTL, without a network call", async () => {
            jest.mocked(getSignedUrl).mockResolvedValue("https://files.example.com/signed");
            const service = createService({ ...SETTINGS, ATTACHMENTS_S3_PUBLIC_ENDPOINT: "https://files.example.com" });

            const url = await service.presignGetUrl("attachments/user-1/abc", {
                contentType: "image/png",
                contentDisposition: "inline",
            });

            expect(url).toBe("https://files.example.com/signed");
            expect(getSignedUrl).toHaveBeenCalledTimes(1);
            const [client, command, options] = jest.mocked(getSignedUrl).mock.calls[0];
            expect(client).toBe(jest.mocked(S3Client).mock.results[1].value);
            expect(command).toBeInstanceOf(GetObjectCommand);
            expect((command as GetObjectCommand).input).toEqual({
                Bucket: "receipts",
                Key: "attachments/user-1/abc",
                ResponseContentType: "image/png",
                ResponseContentDisposition: "inline",
            });
            expect(options).toEqual({ expiresIn: 3600 });
            expect(send).not.toHaveBeenCalled();
        });

        it("putObject sends the bucket, key, body and content type", async () => {
            const service = createService(SETTINGS);
            const body = Buffer.from("receipt bytes");

            await service.putObject("attachments/user-1/abc", body, "image/png");

            expect(send).toHaveBeenCalledTimes(1);
            const command = send.mock.calls[0][0];
            expect(command).toBeInstanceOf(PutObjectCommand);
            expect(command.input).toEqual({
                Bucket: "receipts",
                Key: "attachments/user-1/abc",
                Body: body,
                ContentType: "image/png",
            });
        });

        it("deleteObjects sends one DeleteObjectCommand per key", async () => {
            const service = createService(SETTINGS);

            await service.deleteObjects(["attachments/user-1/a", "attachments/user-1/a-thumb"]);

            expect(send).toHaveBeenCalledTimes(2);
            const commands = send.mock.calls.map((call) => call[0]);
            expect(commands.every((command) => command instanceof DeleteObjectCommand)).toBe(true);
            expect(commands.map((command) => command.input.Key)).toEqual([
                "attachments/user-1/a",
                "attachments/user-1/a-thumb",
            ]);
        });

        it("deleteObjects swallows a failed delete and logs only the key", async () => {
            send.mockRejectedValueOnce(
                Object.assign(new Error("failed at https://s3.example.com"), { name: "Timeout" }),
            ).mockResolvedValueOnce({});
            const service = createService(SETTINGS);
            warn.mockClear();

            await expect(
                service.deleteObjects(["attachments/user-1/first", "attachments/user-1/second"]),
            ).resolves.toBe(undefined);

            expect(send).toHaveBeenCalledTimes(2);
            expect(warn).toHaveBeenCalledTimes(1);
            expect(warn.mock.calls[0][0]).toContain("attachments/user-1/first");
            expect(warn.mock.calls[0][0]).not.toContain("s3.example.com");
        });

        it("deleteObjects does nothing for an empty list", async () => {
            await createService(SETTINGS).deleteObjects([]);

            expect(send).not.toHaveBeenCalled();
        });
    });

    describe("when not configured", () => {
        it("is disabled and never builds an S3 client", () => {
            const service = createService({});

            expect(service.enabled).toBe(false);
            expect(S3Client).not.toHaveBeenCalled();
            expect(warn).not.toHaveBeenCalled();
        });

        it("logs one warning naming the missing variables when the set is partial", () => {
            const service = createService({ ATTACHMENTS_S3_BUCKET: "receipts" });

            expect(service.enabled).toBe(false);
            expect(warn).toHaveBeenCalledTimes(1);
            expect(warn.mock.calls[0][0]).toContain("ATTACHMENTS_S3_ENDPOINT");
            expect(warn.mock.calls[0][0]).not.toContain("receipts");
        });

        it("putObject throws ServiceUnavailableException", async () => {
            const service = createService({});

            await expect(service.putObject("attachments/user-1/abc", Buffer.from("x"), "image/png")).rejects.toThrow(
                ServiceUnavailableException,
            );
            await expect(service.putObject("attachments/user-1/abc", Buffer.from("x"), "image/png")).rejects.toThrow(
                NOT_CONFIGURED_MESSAGE,
            );
            expect(send).not.toHaveBeenCalled();
        });

        it("assertEnabled throws ServiceUnavailableException", () => {
            expect(() => createService({}).assertEnabled()).toThrow(NOT_CONFIGURED_MESSAGE);
        });

        it("presignGetUrl throws ServiceUnavailableException and signs nothing", async () => {
            await expect(
                createService({}).presignGetUrl("attachments/user-1/abc", {
                    contentType: "image/png",
                    contentDisposition: "inline",
                }),
            ).rejects.toThrow(NOT_CONFIGURED_MESSAGE);
            expect(getSignedUrl).not.toHaveBeenCalled();
        });

        it("deleteObjects does nothing", async () => {
            await expect(createService({}).deleteObjects(["attachments/user-1/abc"])).resolves.toBeUndefined();
            expect(send).not.toHaveBeenCalled();
        });
    });
});
