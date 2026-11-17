import { randomUUID } from "crypto";
import { GUARDS_METADATA } from "@nestjs/common/constants";
import { ThrottlerGuard } from "@nestjs/throttler";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { AutoSyncRunController } from "./auto-sync-run.controller";
import { MoveAutoSyncDeviceDto, RunAutoSyncDto } from "./dto";

const SECRET_43 = "a".repeat(43);

describe("AutoSyncRunController (AC7)", () => {
    it("is guarded by the throttler and not by JWT", () => {
        const classGuards: unknown[] = Reflect.getMetadata(GUARDS_METADATA, AutoSyncRunController) ?? [];
        const methodGuards: unknown[] = Reflect.getMetadata(GUARDS_METADATA, AutoSyncRunController.prototype.run) ?? [];

        expect(classGuards).toContain(ThrottlerGuard);
        expect(classGuards).not.toContain(JwtAuthGuard);
        expect(methodGuards).not.toContain(JwtAuthGuard);
    });

    it.each(["run", "moveDevice"] as const)("throttles %s to 10 requests a minute", (handler) => {
        // Keys written by @nestjs/throttler's Throttle decorator, one per named throttler.
        const method = AutoSyncRunController.prototype[handler];
        expect(Reflect.getMetadata(GUARDS_METADATA, method) ?? []).not.toContain(JwtAuthGuard);
        expect(Reflect.getMetadata("THROTTLER:LIMITdefault", method)).toBe(10);
        expect(Reflect.getMetadata("THROTTLER:TTLdefault", method)).toBe(60_000);
    });
});

describe("RunAutoSyncDto validation", () => {
    const dto = (overrides: Record<string, unknown> = {}) =>
        Object.assign(new RunAutoSyncDto(), { grantId: randomUUID(), key: SECRET_43, runToken: SECRET_43 }, overrides);

    it("accepts a UUID grant and 43-character base64url secrets", async () => {
        expect(await validate(dto())).toHaveLength(0);
    });

    it.each([
        ["a non-UUID grant", { grantId: "not-a-uuid" }],
        ["a key of the wrong length", { key: "a".repeat(42) }],
        ["a key with non-base64url characters", { key: "+".repeat(43) }],
        ["a run token of the wrong length", { runToken: "a".repeat(44) }],
    ])("rejects %s", async (_label, overrides) => {
        expect(await validate(dto(overrides))).not.toHaveLength(0);
    });
});

describe("MoveAutoSyncDeviceDto validation", () => {
    // The global ValidationPipe runs with whitelist and forbidNonWhitelisted, so the spec does too.
    const strict = { whitelist: true, forbidNonWhitelisted: true };
    const dto = (overrides: Record<string, unknown> = {}) =>
        plainToInstance(MoveAutoSyncDeviceDto, {
            grantId: randomUUID(),
            key: SECRET_43,
            endpoint: "https://fcm.googleapis.com/fcm/send/abc",
            keys: { p256dh: "p", auth: "a" },
            ...overrides,
        });

    it("accepts a grant, a device key and a push service endpoint", async () => {
        expect(await validate(dto(), strict)).toHaveLength(0);
    });

    it.each([
        ["a key of the wrong length", { key: "a".repeat(42) }],
        ["an endpoint off the known push services", { endpoint: "https://internal.example/hook" }],
        ["missing subscription keys", { keys: { p256dh: "", auth: "a" } }],
    ])("rejects %s", async (_label, overrides) => {
        expect(await validate(dto(overrides), strict)).not.toHaveLength(0);
    });
});
