import { newAttachmentObjectKey, thumbnailKeyFor } from "./attachment-keys";

describe("newAttachmentObjectKey", () => {
    it("namespaces the key by user and uses a random UUID", () => {
        const key = newAttachmentObjectKey("user-1");

        expect(key).toMatch(/^attachments\/user-1\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
        expect(newAttachmentObjectKey("user-1")).not.toBe(key);
    });
});

describe("thumbnailKeyFor", () => {
    it("appends -thumb to the attachment key", () => {
        expect(thumbnailKeyFor("attachments/user-1/abc")).toBe("attachments/user-1/abc-thumb");
    });
});
