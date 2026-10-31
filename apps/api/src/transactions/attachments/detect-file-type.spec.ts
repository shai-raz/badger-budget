import { detectAttachmentType } from "./detect-file-type";

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
const WEBP = Buffer.concat([Buffer.from("RIFF"), Buffer.from([0x24, 0x00, 0x00, 0x00]), Buffer.from("WEBPVP8 ")]);
const PDF = Buffer.from("%PDF-1.7\n%\xe2\xe3\xcf\xd3\n", "latin1");

describe("detectAttachmentType", () => {
    it.each([
        ["JPEG", JPEG, { mime: "image/jpeg", ext: "jpg" }],
        ["PNG", PNG, { mime: "image/png", ext: "png" }],
        ["WebP", WEBP, { mime: "image/webp", ext: "webp" }],
        ["PDF", PDF, { mime: "application/pdf", ext: "pdf" }],
    ])("accepts %s by its magic bytes", (_label, buffer, expected) => {
        expect(detectAttachmentType(buffer)).toEqual(expected);
    });

    it.each([
        ["GIF89a", Buffer.from("GIF89a\x01\x00\x01\x00", "latin1")],
        ["an SVG document", Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')],
        ["an HTML document", Buffer.from("<!DOCTYPE html><html><script>alert(1)</script></html>")],
        ["a Windows executable", Buffer.from("MZ\x90\x00\x03\x00\x00\x00", "latin1")],
        ["an HEIC file", Buffer.from("\x00\x00\x00\x18ftypheic\x00\x00\x00\x00", "latin1")],
        ["an empty buffer", Buffer.alloc(0)],
        ["a truncated PDF signature", Buffer.from("%PD")],
    ])("rejects %s", (_label, buffer) => {
        expect(detectAttachmentType(buffer)).toBeNull();
    });

    it("rejects RIFF containers that are not WebP", () => {
        const wav = Buffer.concat([
            Buffer.from("RIFF"),
            Buffer.from([0x24, 0x00, 0x00, 0x00]),
            Buffer.from("WAVEfmt "),
        ]);
        expect(detectAttachmentType(wav)).toBeNull();
    });
});
