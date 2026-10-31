export interface AttachmentStorageConfig {
    endpoint: string;
    publicEndpoint: string;
    bucket: string;
    accessKeyId: string;
    secretAccessKey: string;
    region: string;
}

export interface AttachmentStorageConfigResult {
    config: AttachmentStorageConfig | null;
    warnings: string[];
}

export const ATTACHMENT_STORAGE_ENV_KEYS = [
    "ATTACHMENTS_S3_ENDPOINT",
    "ATTACHMENTS_S3_BUCKET",
    "ATTACHMENTS_S3_ACCESS_KEY_ID",
    "ATTACHMENTS_S3_SECRET_ACCESS_KEY",
    "ATTACHMENTS_S3_REGION",
    "ATTACHMENTS_S3_PUBLIC_ENDPOINT",
] as const;

/** Trimmed value, or undefined when unset or whitespace-only (same rule as deploy-webhook-config.ts). */
function readVar(env: Record<string, string | undefined>, key: string): string | undefined {
    const value = env[key]?.trim();
    return value ? value : undefined;
}

function isHttpUrl(value: string): boolean {
    try {
        const url = new URL(value);
        return url.protocol === "http:" || url.protocol === "https:";
    } catch {
        return false;
    }
}

/**
 * Parses the ATTACHMENTS_S3_* env vars. Never throws: attachments stay disabled unless all four required variables
 * are set, and every warning names only variables, never their values.
 */
export function parseAttachmentStorageConfig(env: Record<string, string | undefined>): AttachmentStorageConfigResult {
    const endpoint = readVar(env, "ATTACHMENTS_S3_ENDPOINT");
    const bucket = readVar(env, "ATTACHMENTS_S3_BUCKET");
    const accessKeyId = readVar(env, "ATTACHMENTS_S3_ACCESS_KEY_ID");
    const secretAccessKey = readVar(env, "ATTACHMENTS_S3_SECRET_ACCESS_KEY");

    if (endpoint === undefined || bucket === undefined || accessKeyId === undefined || secretAccessKey === undefined) {
        const allUnset =
            endpoint === undefined &&
            bucket === undefined &&
            accessKeyId === undefined &&
            secretAccessKey === undefined;
        if (allUnset) return { config: null, warnings: [] };

        const missing = [
            ["ATTACHMENTS_S3_ENDPOINT", endpoint],
            ["ATTACHMENTS_S3_BUCKET", bucket],
            ["ATTACHMENTS_S3_ACCESS_KEY_ID", accessKeyId],
            ["ATTACHMENTS_S3_SECRET_ACCESS_KEY", secretAccessKey],
        ]
            .filter(([, value]) => value === undefined)
            .map(([key]) => key);
        return {
            config: null,
            warnings: [
                `Attachment storage is partially configured (missing ${missing.join(", ")}); attachments are disabled`,
            ],
        };
    }

    const publicEndpoint = readVar(env, "ATTACHMENTS_S3_PUBLIC_ENDPOINT") ?? endpoint;
    if (!isHttpUrl(endpoint)) {
        return {
            config: null,
            warnings: ["ATTACHMENTS_S3_ENDPOINT is not a valid http(s) URL; attachments are disabled"],
        };
    }
    if (!isHttpUrl(publicEndpoint)) {
        return {
            config: null,
            warnings: ["ATTACHMENTS_S3_PUBLIC_ENDPOINT is not a valid http(s) URL; attachments are disabled"],
        };
    }

    return {
        config: {
            endpoint,
            publicEndpoint,
            bucket,
            accessKeyId,
            secretAccessKey,
            region: readVar(env, "ATTACHMENTS_S3_REGION") ?? "auto",
        },
        warnings: [],
    };
}
