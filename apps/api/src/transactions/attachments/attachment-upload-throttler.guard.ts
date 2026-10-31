import { Injectable } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";

/** Throttles attachment uploads per user. Runs after JwtAuthGuard, so req.user is set. */
@Injectable()
export class AttachmentUploadThrottlerGuard extends ThrottlerGuard {
    protected async getTracker(req: { user: { id: string } }): Promise<string> {
        return `user:${req.user.id}`;
    }
}
