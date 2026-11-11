import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { RegisterPushSubscriptionDto } from "./register-push-subscription.dto";

// The global ValidationPipe runs with whitelist and forbidNonWhitelisted, so the spec does too.
const strict = { whitelist: true, forbidNonWhitelisted: true };

async function failingFields(endpoint: unknown): Promise<string[]> {
    const dto = plainToInstance(RegisterPushSubscriptionDto, {
        endpoint,
        keys: { p256dh: "p", auth: "a" },
        deviceLabel: "Laptop",
    });
    return (await validate(dto, strict)).map((error) => error.property);
}

describe("RegisterPushSubscriptionDto endpoint", () => {
    it.each([
        ["an FCM endpoint", "https://fcm.googleapis.com/fcm/send/abc123"],
        ["a Mozilla endpoint", "https://updates.push.services.mozilla.com/wpush/v2/abc123"],
        ["an Apple endpoint", "https://web.push.apple.com/QAB8abc123"],
        ["a Windows endpoint", "https://db5p.notify.windows.com/?token=abc123"],
    ])("accepts %s", async (_label, endpoint) => {
        expect(await failingFields(endpoint)).toEqual([]);
    });

    it.each([
        ["an http endpoint", "http://fcm.googleapis.com/fcm/send/abc123"],
        ["a localhost endpoint", "https://localhost/abc123"],
        ["a localhost endpoint with a port", "https://localhost:8443/abc123"],
        ["an IP literal", "https://10.0.0.5:8443/abc123"],
        ["a single-label host", "https://router/abc123"],
        ["an unknown host", "https://evil.example.com/abc123"],
        ["a push host as a path segment", "https://evil.example.com/fcm.googleapis.com/abc123"],
        ["a push host as a prefix", "https://fcm.googleapis.com.evil.example/abc123"],
        ["a look-alike Apple host", "https://notpush.apple.com/abc123"],
        ["a non-string endpoint", 42],
        ["a missing endpoint", undefined],
    ])("rejects %s", async (_label, endpoint) => {
        expect(await failingFields(endpoint)).toContain("endpoint");
    });
});
