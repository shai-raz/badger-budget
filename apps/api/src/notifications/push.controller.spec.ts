import { ForbiddenException } from "@nestjs/common";
import { ThrottlerModule } from "@nestjs/throttler";
import { Test, TestingModule } from "@nestjs/testing";
import type { AuthUser } from "../auth/auth-user";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { PushThrottlerGuard } from "./push-throttler.guard";
import { PushController } from "./push.controller";
import { PushService } from "./push.service";
import { PushSubscriptionsService } from "./push-subscriptions.service";
import { VAPID_CONFIG } from "./notifications.tokens";

const USER = {
    id: "user-1",
    email: "owner@example.test",
    firstName: "Owner",
    lastName: "Test",
    role: "USER",
    colorTheme: null,
    isDemo: false,
} as AuthUser;
const DEMO = { ...USER, id: "demo-1", email: "demo@demo.demo", isDemo: true };

const VAPID = { publicKey: "public-key", privateKey: "private-key", subject: "https://example.test" };

describe("PushController", () => {
    let controller: PushController;
    let subscriptions: { register: jest.Mock; list: jest.Mock; remove: jest.Mock; unregister: jest.Mock };
    let push: { send: jest.Mock };

    beforeEach(async () => {
        subscriptions = {
            register: jest.fn().mockResolvedValue({ id: "sub-1" }),
            list: jest.fn().mockResolvedValue([]),
            remove: jest.fn().mockResolvedValue(undefined),
            unregister: jest.fn().mockResolvedValue(undefined),
        };
        push = { send: jest.fn().mockResolvedValue([]) };

        const module: TestingModule = await Test.createTestingModule({
            imports: [ThrottlerModule.forRoot([{ ttl: 60000, limit: 10 }])],
            controllers: [PushController],
            providers: [
                { provide: PushSubscriptionsService, useValue: subscriptions },
                { provide: PushService, useValue: push },
                { provide: VAPID_CONFIG, useValue: VAPID },
            ],
        }).compile();
        controller = module.get(PushController);
    });

    it("requires the JWT guard on the class and throttles the test route per user", () => {
        expect(Reflect.getMetadata("__guards__", PushController)).toContain(JwtAuthGuard);
        expect(Reflect.getMetadata("__guards__", PushController.prototype.sendTest)).toContain(PushThrottlerGuard);
    });

    it("GET vapid-public-key returns the configured public key", () => {
        expect(controller.getVapidPublicKey()).toEqual({ publicKey: "public-key" });
    });

    it("never exposes the VAPID private key", () => {
        expect(JSON.stringify(controller.getVapidPublicKey())).not.toContain("private-key");
    });

    it("POST subscriptions delegates to the service with the signed-in user", async () => {
        const dto = { endpoint: "https://push.example.test/abc", keys: { p256dh: "p", auth: "a" }, deviceLabel: "x" };

        await expect(controller.register(dto, USER)).resolves.toEqual({ id: "sub-1" });
        expect(subscriptions.register).toHaveBeenCalledWith(USER, dto);
    });

    it("GET subscriptions lists the caller's subscriptions", async () => {
        await controller.list(USER);

        expect(subscriptions.list).toHaveBeenCalledWith(USER.id);
    });

    it("DELETE subscriptions/:id removes only the caller's subscription", async () => {
        await controller.remove("00000000-0000-4000-8000-000000000001", USER);

        expect(subscriptions.remove).toHaveBeenCalledWith(USER.id, "00000000-0000-4000-8000-000000000001");
    });

    it("POST subscriptions/unregister forwards the endpoint for the caller", async () => {
        await controller.unregister({ endpoint: "https://push.example.test/abc" }, USER);

        expect(subscriptions.unregister).toHaveBeenCalledWith(USER.id, "https://push.example.test/abc");
    });

    describe("POST test", () => {
        it("sends a system.test notification to the caller and counts accepted deliveries", async () => {
            push.send.mockResolvedValue([
                { subscriptionId: "a", outcome: "accepted" },
                { subscriptionId: "b", outcome: "gone", statusCode: 410 },
                { subscriptionId: "c", outcome: "accepted" },
            ]);

            await expect(controller.sendTest(USER)).resolves.toEqual({ sent: 3, accepted: 2 });
            expect(push.send).toHaveBeenCalledWith(
                { userId: USER.id },
                expect.objectContaining({
                    type: "system.test",
                    title: "Test notification",
                    body: "Push notifications work on this device",
                    url: "/settings/notifications",
                    data: {},
                }),
            );
        });

        it("reports zero when the caller has no subscriptions", async () => {
            await expect(controller.sendTest(USER)).resolves.toEqual({ sent: 0, accepted: 0 });
        });

        it("rejects the demo account without sending", async () => {
            await expect(controller.sendTest(DEMO)).rejects.toBeInstanceOf(ForbiddenException);
            expect(push.send).not.toHaveBeenCalled();
        });
    });
});
