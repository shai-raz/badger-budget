import { ExecutionContext, ForbiddenException, ServiceUnavailableException } from "@nestjs/common";
import { DEMO_EMAIL } from "@badger/shared-data";
import type { AttachmentStorageService } from "./attachment-storage.service";
import { AttachmentUploadGuard } from "./attachment-upload.guard";

function contextFor(user?: { id: string; email: string }): ExecutionContext {
    const request = { user };
    return { switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext;
}

describe("AttachmentUploadGuard", () => {
    const storage = (enabled: boolean) => ({ enabled }) as unknown as AttachmentStorageService;

    it("rejects with 503 when file storage is not configured", () => {
        const guard = new AttachmentUploadGuard(storage(false));

        expect(() => guard.canActivate(contextFor({ id: "user-1", email: "a@example.com" }))).toThrow(
            ServiceUnavailableException,
        );
    });

    it("rejects the demo account with 403", () => {
        const guard = new AttachmentUploadGuard(storage(true));

        expect(() => guard.canActivate(contextFor({ id: "demo-id", email: DEMO_EMAIL }))).toThrow(ForbiddenException);
    });

    it("allows a normal user when storage is configured", () => {
        const guard = new AttachmentUploadGuard(storage(true));

        expect(guard.canActivate(contextFor({ id: "user-1", email: "a@example.com" }))).toBe(true);
    });

    it("checks storage before the demo account", () => {
        const guard = new AttachmentUploadGuard(storage(false));

        expect(() => guard.canActivate(contextFor({ id: "demo-id", email: DEMO_EMAIL }))).toThrow(
            ServiceUnavailableException,
        );
    });
});
