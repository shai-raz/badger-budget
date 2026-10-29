import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { ATTACHMENT_URL_TTL_SECONDS } from "@badger/shared-data";
import {
    ATTACHMENT_STORAGE_ENV_KEYS,
    type AttachmentStorageConfig,
    parseAttachmentStorageConfig,
} from "./attachment-storage.config";

function createClient(settings: AttachmentStorageConfig, endpoint: string): S3Client {
    return new S3Client({
        region: settings.region,
        endpoint,
        credentials: {
            accessKeyId: settings.accessKeyId,
            secretAccessKey: settings.secretAccessKey,
        },
        // Path-style addressing: most S3-compatible services (MinIO, B2, R2) expect it.
        forcePathStyle: true,
        // Send and check CRC checksums only when a request requires them, for compatibility with
        // S3-compatible services that reject the SDK's default checksum headers.
        requestChecksumCalculation: "WHEN_REQUIRED",
        responseChecksumValidation: "WHEN_REQUIRED",
    });
}

interface Storage {
    client: S3Client;
    /** Signs presigned URLs against the public endpoint, the host the browser calls. Signing makes no network call. */
    signer: S3Client;
    bucket: string;
}

/**
 * Writes and deletes attachment objects in a private S3-compatible bucket. Disabled (every write throws 503) unless
 * the ATTACHMENTS_S3_* variables are set. The bucket is private (no public ACL); browsers read objects only through
 * short-lived presigned GET URLs the API signs.
 */
@Injectable()
export class AttachmentStorageService {
    private readonly logger = new Logger(AttachmentStorageService.name);
    private readonly storage: Storage | null;

    constructor(config: ConfigService) {
        const env: Record<string, string | undefined> = {};
        for (const key of ATTACHMENT_STORAGE_ENV_KEYS) env[key] = config.get<string>(key);

        const result = parseAttachmentStorageConfig(env);
        for (const warning of result.warnings) this.logger.warn(warning);

        const settings = result.config;
        this.storage = settings
            ? {
                  client: createClient(settings, settings.endpoint),
                  signer: createClient(settings, settings.publicEndpoint),
                  bucket: settings.bucket,
              }
            : null;
    }

    get enabled(): boolean {
        return this.storage !== null;
    }

    /** Throws ServiceUnavailableException("File storage isn't configured on this server") when disabled. */
    assertEnabled(): void {
        this.requireStorage();
    }

    /**
     * Presigned GET, valid for ATTACHMENT_URL_TTL_SECONDS. The response headers are signed too, so the browser gets the
     * given Content-Type and Content-Disposition whatever metadata the object was stored with.
     */
    async presignGetUrl(key: string, options: { contentType: string; contentDisposition: string }): Promise<string> {
        const { signer, bucket } = this.requireStorage();
        return getSignedUrl(
            signer,
            new GetObjectCommand({
                Bucket: bucket,
                Key: key,
                ResponseContentType: options.contentType,
                ResponseContentDisposition: options.contentDisposition,
            }),
            { expiresIn: ATTACHMENT_URL_TTL_SECONDS },
        );
    }

    async putObject(key: string, body: Buffer, contentType: string): Promise<void> {
        const { client, bucket } = this.requireStorage();
        await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }));
    }

    /**
     * Best effort: one DeleteObjectCommand per key. Failures are logged by key only and never thrown. A no-op when
     * storage is disabled or there are no keys.
     */
    async deleteObjects(keys: string[]): Promise<void> {
        if (this.storage === null || keys.length === 0) return;
        const { client, bucket } = this.storage;

        const results = await Promise.allSettled(
            keys.map((key) => client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))),
        );
        results.forEach((result, index) => {
            if (result.status === "rejected") this.logger.warn(`Could not delete attachment object ${keys[index]}`);
        });
    }

    private requireStorage(): Storage {
        if (this.storage === null)
            throw new ServiceUnavailableException("File storage isn't configured on this server");
        return this.storage;
    }
}
