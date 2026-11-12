import { HttpException, HttpStatus } from "@nestjs/common";

export const PIN_ATTEMPT_LIMIT = 5;
export const PIN_ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
export const TOO_MANY_PIN_ATTEMPTS_MESSAGE = "Too many wrong PIN attempts. Try again in a few minutes.";

/** Wrong sync-PIN attempts per user in a fixed window, in memory (one API instance; resets on restart). */
export class PinAttemptLimiter {
    private readonly windows = new Map<string, { startedAt: number; failures: number }>();

    constructor(private readonly now: () => number = () => Date.now()) {}

    /** Throws HttpException(TOO_MANY_PIN_ATTEMPTS_MESSAGE, 429) when the user has PIN_ATTEMPT_LIMIT failures in an unexpired window. Deletes the user's entry if its window has expired. */
    assertAllowed(userId: string): void {
        const window = this.windows.get(userId);
        if (!window) return;
        if (this.isExpired(window, this.now())) {
            this.windows.delete(userId);
            return;
        }
        if (window.failures >= PIN_ATTEMPT_LIMIT) {
            throw new HttpException(TOO_MANY_PIN_ATTEMPTS_MESSAGE, HttpStatus.TOO_MANY_REQUESTS);
        }
    }

    /** Counts one wrong PIN: starts a new window (startedAt = now, failures = 1) when there is none or it has expired, else increments. Also prunes every expired entry, so the map cannot grow without bound. */
    recordFailure(userId: string): void {
        const now = this.now();
        for (const [id, window] of this.windows) {
            if (this.isExpired(window, now)) this.windows.delete(id);
        }
        const window = this.windows.get(userId);
        if (!window) {
            this.windows.set(userId, { startedAt: now, failures: 1 });
            return;
        }
        window.failures += 1;
    }

    /** Number of users currently tracked (for tests). */
    get trackedUsers(): number {
        return this.windows.size;
    }

    private isExpired(window: { startedAt: number }, now: number): boolean {
        return now - window.startedAt >= PIN_ATTEMPT_WINDOW_MS;
    }
}
