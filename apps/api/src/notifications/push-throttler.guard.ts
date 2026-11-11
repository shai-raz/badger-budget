import { Injectable } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";

/** Throttles per user. Run after `JwtAuthGuard`, which sets `request.user`. */
@Injectable()
export class PushThrottlerGuard extends ThrottlerGuard {
    protected async getTracker(req: { user: { id: string } }): Promise<string> {
        return `user:${req.user.id}`;
    }
}
