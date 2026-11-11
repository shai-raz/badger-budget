import { Logger } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { WebPushError } from "web-push";
import type { NotificationContent, NotificationTypeRegistry } from "@badger/shared-data";
import { PrismaService } from "../prisma/prisma.service";
import { NotificationPreferencesService } from "./notification-preferences.service";
import {
    NOTIFICATION_MANDATORY_RULES,
    NOTIFICATION_REGISTRY,
    PUSH_SENDER,
    type MandatoryRules,
} from "./notifications.tokens";
import type { PushSendOptions, PushSendTarget } from "./push-sender";
import { DEFAULT_PUSH_TTL_SECONDS, PushService } from "./push.service";

const fixtureRegistry: NotificationTypeRegistry<string> = {
    "fixture.normal": { label: "Normal", description: "d", defaultEnabled: true, mandatory: false, listed: true },
    "fixture.muted": { label: "Muted", description: "d", defaultEnabled: false, mandatory: false, listed: true },
    "fixture.admin-only": {
        label: "Admin",
        description: "d",
        defaultEnabled: true,
        roles: ["ADMIN"],
        mandatory: false,
        listed: true,
    },
    "fixture.mandatory": { label: "Mandatory", description: "d", defaultEnabled: true, mandatory: true, listed: true },
    "fixture.conditional": {
        label: "Conditional",
        description: "d",
        defaultEnabled: true,
        mandatory: false,
        listed: true,
    },
};

const USER = { id: "user-1", role: "USER" };
const ADMIN = { id: "admin-1", role: "ADMIN" };

/**
 * Fixture type ids are not NotificationType members, and PushService only reads `type` from the content.
 * The cast keeps the real content shape everywhere else.
 */
function contentOf(type: string): NotificationContent {
    return { type, title: "Title", body: "Body", url: "/", data: {} } as unknown as NotificationContent;
}

function subscription(id: string) {
    return { id, endpoint: `https://push.example.test/${id}`, p256dh: `p256-${id}`, auth: `auth-${id}` };
}

describe("PushService", () => {
    let service: PushService;
    let prisma: {
        user: { findFirst: jest.Mock };
        pushSubscription: {
            findFirst: jest.Mock;
            findUnique: jest.Mock;
            findMany: jest.Mock;
            updateMany: jest.Mock;
            deleteMany: jest.Mock;
        };
        notificationPreference: { findUnique: jest.Mock };
    };
    let sender: jest.Mock<Promise<void>, [PushSendTarget, string, PushSendOptions]>;
    let warn: jest.SpyInstance;
    let error: jest.SpyInstance;

    async function build(): Promise<void> {
        const rules: MandatoryRules = {};
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                PushService,
                NotificationPreferencesService,
                { provide: PrismaService, useValue: prisma },
                { provide: NOTIFICATION_REGISTRY, useValue: fixtureRegistry },
                { provide: NOTIFICATION_MANDATORY_RULES, useValue: rules },
                { provide: PUSH_SENDER, useValue: sender },
            ],
        }).compile();

        service = module.get(PushService);
    }

    beforeEach(async () => {
        prisma = {
            user: { findFirst: jest.fn().mockResolvedValue(USER) },
            pushSubscription: {
                findFirst: jest.fn().mockResolvedValue(subscription("sub-1")),
                findUnique: jest.fn().mockResolvedValue(subscription("sub-1")),
                findMany: jest.fn().mockResolvedValue([subscription("sub-1")]),
                updateMany: jest.fn().mockResolvedValue({ count: 1 }),
                deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
            },
            notificationPreference: { findUnique: jest.fn().mockResolvedValue(null) },
        };
        sender = jest.fn<Promise<void>, [PushSendTarget, string, PushSendOptions]>().mockResolvedValue(undefined);
        warn = jest.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
        error = jest.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
        await build();
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe("payload and options", () => {
        it("sends the content with the type as the default tag, and the default ttl and urgency", async () => {
            await service.send({ userId: USER.id }, contentOf("fixture.normal"));

            expect(sender).toHaveBeenCalledWith(
                { endpoint: "https://push.example.test/sub-1", keys: { p256dh: "p256-sub-1", auth: "auth-sub-1" } },
                JSON.stringify({ ...contentOf("fixture.normal"), tag: "fixture.normal" }),
                { ttl: DEFAULT_PUSH_TTL_SECONDS, urgency: "normal" },
            );
        });

        it("honours tag, ttl and urgency overrides", async () => {
            await service.send({ userId: USER.id }, contentOf("fixture.normal"), {
                tag: "sync-42",
                ttl: 60,
                urgency: "high",
            });

            expect(sender).toHaveBeenCalledWith(expect.anything(), expect.stringContaining('"tag":"sync-42"'), {
                ttl: 60,
                urgency: "high",
            });
        });

        it("passes no topic: the tag stays a client-side key", async () => {
            await service.send({ userId: USER.id }, contentOf("fixture.normal"));

            expect(Object.keys(sender.mock.calls[0][2])).toEqual(["ttl", "urgency"]);
        });
    });

    describe("user target", () => {
        it("sends to every subscription of the user in parallel", async () => {
            prisma.pushSubscription.findMany.mockResolvedValue([subscription("sub-1"), subscription("sub-2")]);

            const results = await service.send({ userId: USER.id }, contentOf("fixture.normal"));

            expect(sender).toHaveBeenCalledTimes(2);
            expect(results).toEqual([
                { subscriptionId: "sub-1", outcome: "accepted" },
                { subscriptionId: "sub-2", outcome: "accepted" },
            ]);
        });

        it("returns nothing for a missing or deleted user", async () => {
            prisma.user.findFirst.mockResolvedValue(null);

            await expect(service.send({ userId: "gone" }, contentOf("fixture.normal"))).resolves.toEqual([]);
            expect(prisma.user.findFirst).toHaveBeenCalledWith(
                expect.objectContaining({ where: { id: "gone", deletedAt: null } }),
            );
            expect(sender).not.toHaveBeenCalled();
        });

        it("skips a type the user has muted", async () => {
            await expect(service.send({ userId: USER.id }, contentOf("fixture.muted"))).resolves.toEqual([]);
            expect(sender).not.toHaveBeenCalled();
        });

        it("sends a mandatory type even when a stored row disables it", async () => {
            prisma.notificationPreference.findUnique.mockResolvedValue({ enabled: false });

            const results = await service.send({ userId: USER.id }, contentOf("fixture.mandatory"));

            expect(sender).toHaveBeenCalledTimes(1);
            expect(results).toEqual([{ subscriptionId: "sub-1", outcome: "accepted" }]);
        });

        it("never sends an admin-only type to a USER", async () => {
            await expect(service.send({ userId: USER.id }, contentOf("fixture.admin-only"))).resolves.toEqual([]);
            expect(sender).not.toHaveBeenCalled();
        });

        it("sends an admin-only type to an ADMIN", async () => {
            prisma.user.findFirst.mockResolvedValue(ADMIN);

            await service.send({ userId: ADMIN.id }, contentOf("fixture.admin-only"));

            expect(sender).toHaveBeenCalledTimes(1);
        });
    });

    describe("subscription target", () => {
        it("sends to that one subscription and skips the preference checks", async () => {
            const results = await service.send({ subscriptionId: "sub-1" }, contentOf("fixture.muted"));

            expect(prisma.pushSubscription.findFirst).toHaveBeenCalledWith(
                expect.objectContaining({ where: { id: "sub-1", removedAt: null } }),
            );
            expect(prisma.user.findFirst).not.toHaveBeenCalled();
            expect(sender).toHaveBeenCalledTimes(1);
            expect(results).toEqual([{ subscriptionId: "sub-1", outcome: "accepted" }]);
        });

        it("returns nothing when the subscription does not exist", async () => {
            prisma.pushSubscription.findFirst.mockResolvedValue(null);

            await expect(service.send({ subscriptionId: "missing" }, contentOf("fixture.normal"))).resolves.toEqual([]);
            expect(sender).not.toHaveBeenCalled();
        });

        it("never sends to a subscription the user removed", async () => {
            prisma.pushSubscription.findFirst.mockResolvedValue(null);

            await expect(service.send({ subscriptionId: "sub-1" }, contentOf("fixture.normal"))).resolves.toEqual([]);
            expect(sender).not.toHaveBeenCalled();
        });
    });

    describe("removed endpoints", () => {
        it("reads only subscriptions that are not removed for a user target", async () => {
            await service.send({ userId: USER.id }, contentOf("fixture.normal"));

            expect(prisma.pushSubscription.findMany).toHaveBeenCalledWith(
                expect.objectContaining({ where: { userId: USER.id, removedAt: null } }),
            );
        });
    });

    describe("result mapping", () => {
        it("marks an accepted push and stamps lastAcceptedAt", async () => {
            const before = Date.now();

            const results = await service.send({ userId: USER.id }, contentOf("fixture.normal"));

            expect(results).toEqual([{ subscriptionId: "sub-1", outcome: "accepted" }]);
            const update = prisma.pushSubscription.updateMany.mock.calls[0][0];
            expect(update.where).toEqual({ id: "sub-1" });
            expect(update.data.lastAcceptedAt).toBeInstanceOf(Date);
            expect(update.data.lastAcceptedAt.getTime()).toBeGreaterThanOrEqual(before);
            expect(prisma.pushSubscription.deleteMany).not.toHaveBeenCalled();
        });

        it("still reports accepted when the row was removed while the push was in flight", async () => {
            prisma.pushSubscription.updateMany.mockResolvedValue({ count: 0 });

            const results = await service.send({ userId: USER.id }, contentOf("fixture.normal"));

            expect(results).toEqual([{ subscriptionId: "sub-1", outcome: "accepted" }]);
            expect(warn).not.toHaveBeenCalled();
        });

        it.each([404, 410])("removes the subscription on %i", async (statusCode) => {
            sender.mockRejectedValue(new WebPushError("gone", statusCode, {}, "", "https://push.example.test/sub-1"));

            const results = await service.send({ userId: USER.id }, contentOf("fixture.normal"));

            expect(results).toEqual([{ subscriptionId: "sub-1", outcome: "gone", statusCode }]);
            expect(prisma.pushSubscription.deleteMany).toHaveBeenCalledWith({ where: { id: "sub-1" } });
            expect(prisma.pushSubscription.updateMany).not.toHaveBeenCalled();
        });

        it.each([403, 413, 429, 500, 503])("keeps the subscription and reports failed on %i", async (statusCode) => {
            sender.mockRejectedValue(
                new WebPushError("rejected", statusCode, {}, "", "https://push.example.test/sub-1"),
            );

            const results = await service.send({ userId: USER.id }, contentOf("fixture.normal"));

            expect(results).toEqual([{ subscriptionId: "sub-1", outcome: "failed", statusCode }]);
            expect(prisma.pushSubscription.deleteMany).not.toHaveBeenCalled();
            expect(prisma.pushSubscription.updateMany).not.toHaveBeenCalled();
        });

        it("keeps the subscription and reports failed on a network error", async () => {
            sender.mockRejectedValue(new Error("socket hang up"));

            const results = await service.send({ userId: USER.id }, contentOf("fixture.normal"));

            expect(results).toEqual([{ subscriptionId: "sub-1", outcome: "failed" }]);
            expect(prisma.pushSubscription.deleteMany).not.toHaveBeenCalled();
        });

        it("logs an error for 403 that points at the VAPID key", async () => {
            sender.mockRejectedValue(new WebPushError("rejected", 403, {}, "", "https://push.example.test/sub-1"));

            await service.send({ userId: USER.id }, contentOf("fixture.normal"));

            expect(error).toHaveBeenCalledTimes(1);
            expect(String(error.mock.calls[0][0])).toContain("VAPID");
            expect(warn).not.toHaveBeenCalled();
        });

        it("logs a warning for other failures", async () => {
            sender.mockRejectedValue(new WebPushError("rejected", 500, {}, "", "https://push.example.test/sub-1"));

            await service.send({ userId: USER.id }, contentOf("fixture.normal"));

            expect(warn).toHaveBeenCalledTimes(1);
            expect(error).not.toHaveBeenCalled();
        });

        it("logs the subscription id and status, never the endpoint or payload", async () => {
            sender.mockRejectedValue(new WebPushError("rejected", 500, {}, "", "https://push.example.test/sub-1"));

            await service.send({ userId: USER.id }, contentOf("fixture.normal"));

            const logged = [...warn.mock.calls, ...error.mock.calls].map((args) => args.join(" ")).join("\n");
            expect(logged).toContain("sub-1");
            expect(logged).toContain("500");
            expect(logged).not.toContain("push.example.test");
            expect(logged).not.toContain("Title");
        });
    });

    describe("never throws", () => {
        it("reports each subscription on its own outcome", async () => {
            prisma.pushSubscription.findMany.mockResolvedValue([subscription("sub-1"), subscription("sub-2")]);
            sender
                .mockResolvedValueOnce(undefined)
                .mockRejectedValueOnce(new WebPushError("gone", 410, {}, "", "https://push.example.test/sub-2"));

            const results = await service.send({ userId: USER.id }, contentOf("fixture.normal"));

            expect(results).toEqual([
                { subscriptionId: "sub-1", outcome: "accepted" },
                { subscriptionId: "sub-2", outcome: "gone", statusCode: 410 },
            ]);
        });

        it("reports failed when the bookkeeping write itself throws", async () => {
            prisma.pushSubscription.updateMany.mockRejectedValue(new Error("db down"));

            await expect(service.send({ userId: USER.id }, contentOf("fixture.normal"))).resolves.toEqual([
                { subscriptionId: "sub-1", outcome: "failed" },
            ]);
        });
    });
});
