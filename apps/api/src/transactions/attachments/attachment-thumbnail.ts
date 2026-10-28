import { Logger } from "@nestjs/common";
import sharp from "sharp";

// Ten parallel 10 MB uploads per user: keep sharp's libvips cache and thread pool small so memory stays bounded.
sharp.cache(false);
sharp.concurrency(1);

export const THUMBNAIL_MAX_SIDE = 320;
/** Decompression-bomb guard. sharp's default limit is about 268 megapixels. */
export const THUMBNAIL_MAX_INPUT_PIXELS = 50_000_000;

const logger = new Logger("AttachmentThumbnail");

/**
 * WebP thumbnail with EXIF orientation applied and metadata stripped, or null if the image can't be decoded. Never
 * throws. Only the error class is logged, never file content.
 */
export async function generateAttachmentThumbnail(input: Buffer): Promise<Buffer | null> {
    try {
        return await sharp(input, { limitInputPixels: THUMBNAIL_MAX_INPUT_PIXELS, failOn: "error" })
            .rotate()
            .resize(THUMBNAIL_MAX_SIDE, THUMBNAIL_MAX_SIDE, { fit: "inside", withoutEnlargement: true })
            .webp({ quality: 75 })
            .toBuffer();
    } catch (error) {
        logger.warn(`Could not generate an attachment thumbnail: ${error instanceof Error ? error.name : "unknown"}`);
        return null;
    }
}
