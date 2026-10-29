import { sanitizeAttachmentBaseName, sanitizeAttachmentFileName, splitAttachmentFileName } from "@badger/utils";

const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

describe("sanitizeAttachmentFileName", () => {
    it("removes path traversal and forbidden characters", () => {
        expect(sanitizeAttachmentFileName("../../etc/pa:ss*wd.jpg", "jpg")).toBe("etcpasswd.jpg");
    });

    it("caps the display name at the attachment name limit", () => {
        const result = sanitizeAttachmentFileName(`${"a".repeat(300)}.pdf`, "pdf");
        expect(Array.from(result).length).toBeLessThanOrEqual(100);
        expect(result.endsWith(".pdf")).toBe(true);
    });

    it("keeps Hebrew names intact", () => {
        expect(sanitizeAttachmentFileName("קבלה סופר-פארם.jpg", "jpg")).toBe("קבלה סופר-פארם.jpg");
    });

    it("falls back to attachment.<ext> when nothing is left", () => {
        expect(sanitizeAttachmentFileName(":::***.png", "png")).toBe("attachment.png");
    });

    it("replaces the uploaded extension with the detected one", () => {
        expect(sanitizeAttachmentFileName("scan.exe", "pdf")).toBe("scan.pdf");
    });

    it("drops control characters and collapses whitespace runs", () => {
        expect(sanitizeAttachmentFileName("a\u0000b\tc   \n d.pdf", "pdf")).toBe("abc d.pdf");
    });

    it("strips leading dots so the name is not hidden", () => {
        expect(sanitizeAttachmentFileName(".hidden.pdf", "pdf")).toBe("hidden.pdf");
    });

    it("does not split a surrogate pair at the truncation boundary", () => {
        const result = sanitizeAttachmentFileName(`${"😀".repeat(100)}.pdf`, "pdf");
        expect(Array.from(result).length).toBeLessThanOrEqual(100);
        expect(result.endsWith(".pdf")).toBe(true);
        expect(LONE_SURROGATE.test(result)).toBe(false);
    });
});

describe("sanitizeAttachmentBaseName", () => {
    it("drops a typed extension so the base does not double it", () => {
        expect(sanitizeAttachmentBaseName("foo.pdf", "pdf")).toBe("foo");
    });

    it("returns an empty string when nothing is left", () => {
        expect(sanitizeAttachmentBaseName("  ***  ", "png")).toBe("");
    });
});

describe("splitAttachmentFileName", () => {
    it.each([
        ["receipt.jpg", { base: "receipt", ext: "jpg" }],
        ["archive.tar.gz", { base: "archive.tar", ext: "gz" }],
        ["noextension", { base: "noextension", ext: "" }],
        [".hidden", { base: "", ext: "hidden" }],
        ["trailing.", { base: "trailing", ext: "" }],
    ])("splits %j", (name, expected) => {
        expect(splitAttachmentFileName(name)).toEqual(expected);
    });
});
