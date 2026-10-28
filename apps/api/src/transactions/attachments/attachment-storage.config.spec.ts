import { parseAttachmentStorageConfig } from "./attachment-storage.config";

const SECRET = "super-secret-key-value";

const required = {
    ATTACHMENTS_S3_ENDPOINT: "https://s3.example.com",
    ATTACHMENTS_S3_BUCKET: "receipts",
    ATTACHMENTS_S3_ACCESS_KEY_ID: "access-key-id",
    ATTACHMENTS_S3_SECRET_ACCESS_KEY: SECRET,
};

describe("parseAttachmentStorageConfig", () => {
    it("is disabled without warnings when nothing is set", () => {
        expect(parseAttachmentStorageConfig({})).toEqual({ config: null, warnings: [] });
    });

    it("is disabled without warnings when every variable is blank", () => {
        expect(
            parseAttachmentStorageConfig({
                ATTACHMENTS_S3_ENDPOINT: "  ",
                ATTACHMENTS_S3_BUCKET: "",
                ATTACHMENTS_S3_ACCESS_KEY_ID: "\t",
                ATTACHMENTS_S3_SECRET_ACCESS_KEY: " ",
            }),
        ).toEqual({ config: null, warnings: [] });
    });

    it("enables with region auto and the public endpoint falling back to the endpoint", () => {
        expect(parseAttachmentStorageConfig({ ...required })).toEqual({
            config: {
                endpoint: "https://s3.example.com",
                publicEndpoint: "https://s3.example.com",
                bucket: "receipts",
                accessKeyId: "access-key-id",
                secretAccessKey: SECRET,
                region: "auto",
            },
            warnings: [],
        });
    });

    it("uses the configured region and public endpoint", () => {
        const result = parseAttachmentStorageConfig({
            ...required,
            ATTACHMENTS_S3_REGION: "us-east-1",
            ATTACHMENTS_S3_PUBLIC_ENDPOINT: "https://files.example.com",
        });

        expect(result.config).toMatchObject({
            region: "us-east-1",
            publicEndpoint: "https://files.example.com",
        });
    });

    it("names only the missing variables when the set is partial, never their values", () => {
        const result = parseAttachmentStorageConfig({
            ATTACHMENTS_S3_ENDPOINT: "https://s3.example.com",
            ATTACHMENTS_S3_SECRET_ACCESS_KEY: SECRET,
        });

        expect(result.config).toBeNull();
        expect(result.warnings).toEqual([
            "Attachment storage is partially configured (missing ATTACHMENTS_S3_BUCKET, ATTACHMENTS_S3_ACCESS_KEY_ID); attachments are disabled",
        ]);
        expect(result.warnings.join("\n")).not.toContain(SECRET);
    });

    it("treats a whitespace-only required variable as missing", () => {
        const result = parseAttachmentStorageConfig({ ...required, ATTACHMENTS_S3_BUCKET: "   " });

        expect(result.config).toBeNull();
        expect(result.warnings).toEqual([
            "Attachment storage is partially configured (missing ATTACHMENTS_S3_BUCKET); attachments are disabled",
        ]);
    });

    it("disables with a warning naming ATTACHMENTS_S3_ENDPOINT when it is not an http(s) URL", () => {
        const result = parseAttachmentStorageConfig({ ...required, ATTACHMENTS_S3_ENDPOINT: "not a url" });

        expect(result.config).toBeNull();
        expect(result.warnings).toEqual([
            "ATTACHMENTS_S3_ENDPOINT is not a valid http(s) URL; attachments are disabled",
        ]);
        expect(result.warnings.join("\n")).not.toContain(SECRET);
    });

    it("disables with a warning naming ATTACHMENTS_S3_PUBLIC_ENDPOINT when it is not an http(s) URL", () => {
        const result = parseAttachmentStorageConfig({
            ...required,
            ATTACHMENTS_S3_PUBLIC_ENDPOINT: "ftp://files.example.com",
        });

        expect(result.config).toBeNull();
        expect(result.warnings).toEqual([
            "ATTACHMENTS_S3_PUBLIC_ENDPOINT is not a valid http(s) URL; attachments are disabled",
        ]);
    });
});
