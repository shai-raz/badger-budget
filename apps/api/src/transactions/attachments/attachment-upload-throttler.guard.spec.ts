import { AttachmentUploadThrottlerGuard } from "./attachment-upload-throttler.guard";

describe("AttachmentUploadThrottlerGuard", () => {
    // getTracker does not use the injected throttler collaborators.
    const guard = Object.create(AttachmentUploadThrottlerGuard.prototype) as {
        getTracker(req: object): Promise<string>;
    };

    it("tracks per user id", async () => {
        await expect(guard.getTracker({ user: { id: "u1" } })).resolves.toBe("user:u1");
    });

    it("keeps different users in different buckets", async () => {
        const first = await guard.getTracker({ user: { id: "u1" } });
        const second = await guard.getTracker({ user: { id: "u2" } });

        expect(first).not.toBe(second);
    });
});
