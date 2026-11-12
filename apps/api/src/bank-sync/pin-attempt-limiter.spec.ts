import { HttpException } from "@nestjs/common";
import {
    PIN_ATTEMPT_LIMIT,
    PIN_ATTEMPT_WINDOW_MS,
    PinAttemptLimiter,
    TOO_MANY_PIN_ATTEMPTS_MESSAGE,
} from "./pin-attempt-limiter";

describe("PinAttemptLimiter", () => {
    let t: number;
    let limiter: PinAttemptLimiter;

    const failures = (userId: string, count: number) => {
        for (let i = 0; i < count; i++) limiter.recordFailure(userId);
    };

    beforeEach(() => {
        t = 0;
        limiter = new PinAttemptLimiter(() => t);
    });

    it("allows attempts under the limit and blocks the one that reaches it with 429", () => {
        failures("a", PIN_ATTEMPT_LIMIT - 1);
        expect(() => limiter.assertAllowed("a")).not.toThrow();

        failures("a", 1);
        let caught: unknown;
        try {
            limiter.assertAllowed("a");
        } catch (error) {
            caught = error;
        }
        expect(caught).toBeInstanceOf(HttpException);
        expect((caught as HttpException).getStatus()).toBe(429);
        expect((caught as HttpException).getResponse()).toBe(TOO_MANY_PIN_ATTEMPTS_MESSAGE);
    });

    it("does not affect another user", () => {
        failures("a", PIN_ATTEMPT_LIMIT);
        expect(() => limiter.assertAllowed("a")).toThrow(HttpException);
        expect(() => limiter.assertAllowed("b")).not.toThrow();
    });

    it("stays blocked until the window expires, then starts a fresh count", () => {
        failures("a", PIN_ATTEMPT_LIMIT);

        t = PIN_ATTEMPT_WINDOW_MS - 1;
        expect(() => limiter.assertAllowed("a")).toThrow(HttpException);

        t = PIN_ATTEMPT_WINDOW_MS;
        expect(() => limiter.assertAllowed("a")).not.toThrow();

        failures("a", 1);
        failures("a", PIN_ATTEMPT_LIMIT - 2);
        expect(() => limiter.assertAllowed("a")).not.toThrow();

        failures("a", 1);
        expect(() => limiter.assertAllowed("a")).toThrow(HttpException);
    });

    it("uses a fixed window that nothing resets early", () => {
        limiter.recordFailure("a");
        t = 14 * 60 * 1000;
        failures("a", PIN_ATTEMPT_LIMIT - 1);
        expect(() => limiter.assertAllowed("a")).toThrow(HttpException);

        t = PIN_ATTEMPT_WINDOW_MS;
        expect(() => limiter.assertAllowed("a")).not.toThrow();
    });

    it("prunes expired entries when a new failure is recorded", () => {
        limiter.recordFailure("a");
        expect(limiter.trackedUsers).toBe(1);

        t = PIN_ATTEMPT_WINDOW_MS;
        limiter.recordFailure("b");
        expect(limiter.trackedUsers).toBe(1);
    });
});
