import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

@Injectable()
export class DebugArtifactService {
    private readonly logger = new Logger(DebugArtifactService.name);
    private client: S3Client | null = null;
    private bucket: string | null = null;
    private presignTtl: number;
    private configured = false;

    constructor(private configService: ConfigService) {
        const accountId = this.configService.get<string>("R2_ACCOUNT_ID");
        const accessKeyId = this.configService.get<string>("R2_ACCESS_KEY_ID");
        const secretAccessKey = this.configService.get<string>("R2_SECRET_ACCESS_KEY");
        this.bucket = this.configService.get<string>("R2_BUCKET") ?? null;
        this.presignTtl = parseInt(this.configService.get<string>("R2_PRESIGN_TTL", "604800"), 10); // 7 days default

        if (accountId && accessKeyId && secretAccessKey && this.bucket) {
            this.client = new S3Client({
                region: "auto",
                endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
                credentials: { accessKeyId, secretAccessKey },
            });
            this.configured = true;
        }
    }

    async upload(key: string, body: Buffer, contentType: string): Promise<string | null> {
        if (!this.configured || !this.client || !this.bucket) {
            this.logger.warn("R2 not configured — skipping upload, caller should fall back to disk");
            return null;
        }

        await this.client.send(
            new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }),
        );

        const url = await getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: key }), {
            expiresIn: this.presignTtl,
        });

        return url;
    }
}
