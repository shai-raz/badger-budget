import sharp from "sharp";
import { generateAttachmentThumbnail } from "./attachment-thumbnail";

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe("generateAttachmentThumbnail", () => {
    it("scales a PNG to fit 320 px as WebP with no metadata", async () => {
        const input = await sharp({
            create: { width: 1000, height: 500, channels: 3, background: "#f00" },
        })
            .png()
            .toBuffer();

        const output = await generateAttachmentThumbnail(input);

        expect(output).not.toBeNull();
        const metadata = await sharp(output as Buffer).metadata();
        expect(metadata.format).toBe("webp");
        expect(metadata.width).toBe(320);
        expect(metadata.height).toBe(160);
        expect(metadata.exif).toBeUndefined();
    });

    it("applies EXIF orientation before scaling and strips the tag", async () => {
        const input = await sharp({
            create: { width: 400, height: 200, channels: 3, background: "#0f0" },
        })
            .jpeg()
            .withMetadata({ orientation: 6 })
            .toBuffer();

        const output = await generateAttachmentThumbnail(input);

        const metadata = await sharp(output as Buffer).metadata();
        expect(metadata.format).toBe("webp");
        expect(metadata.width).toBe(160);
        expect(metadata.height).toBe(320);
        expect(metadata.orientation).toBeUndefined();
        expect(metadata.exif).toBeUndefined();
    });

    it("returns null for bytes that look like a PNG but can't be decoded", async () => {
        const input = Buffer.concat([PNG_SIGNATURE, Buffer.from("not really an image at all")]);

        await expect(generateAttachmentThumbnail(input)).resolves.toBeNull();
    });

    it("does not enlarge an image that is already smaller than the thumbnail size", async () => {
        const input = await sharp({
            create: { width: 100, height: 50, channels: 3, background: "#00f" },
        })
            .png()
            .toBuffer();

        const output = await generateAttachmentThumbnail(input);

        const metadata = await sharp(output as Buffer).metadata();
        expect(metadata.width).toBe(100);
        expect(metadata.height).toBe(50);
    });
});
