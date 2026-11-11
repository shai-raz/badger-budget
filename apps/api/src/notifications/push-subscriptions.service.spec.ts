import { ForbiddenException, GoneException, NotFoundException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import type { AuthUser } from "../auth/auth-user";
import { PrismaService } from "../prisma/prisma.service";
import { PushSubscriptionsService } from "./push-subscriptions.service";

const USER: AuthUser = {
    id: "user-1",
    email: "owner@example.test",
    firstName: "Owner",
    lastName: "Test",
    role: "USER",
    colorTheme: null,
    isDemo: false,
} as AuthUser;

const DEMO: AuthUser = { ...USER, id: "demo-1", email: "demo@demo.demo", isDemo: true };

const DTO = {
    endpoint: "https://push.example.test/abc",
    keys: { p256dh: "p256-key", auth: "auth-secret" },
    deviceLabel: "Laptop",
};

const CREATED = new Date("2026-11-01T10:00:00.000Z");
const SEEN = new Date("2026-11-10T08:30:00.000Z");
const ACCEPTED = new Date("2026-11-09T12:00:00.000Z");

describe("PushSubscriptionsService", () => {
    let service: PushSubscriptionsService;
    let prisma: {
        pushSubscription: {
            upsert: jest.Mock;
            findUnique: jest.Mock;
            findMany: jest.Mock;
            updateMany: jest.Mock;
            deleteMany: jest.Mock;
        };
    };

    beforeEach(async () => {
        prisma = {
            pushSubscription: {
                findUnique: jest.fn().mockResolvedValue(null),
                upsert: jest.fn().mockResolvedValue({
                    id: "sub-1",
                    endpoint: DTO.endpoint,
                    deviceLabel: DTO.deviceLabel,
                    createdAt: CREATED,
                    lastSeenAt: SEEN,
                    lastAcceptedAt: null,
                }),
                findMany: jest.fn().mockResolvedValue([]),
                updateMany: jest.fn().mockResolvedValue({ count: 1 }),
                deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
            },
        };

        const module: TestingModule = await Test.createTestingModule({
            providers: [PushSubscriptionsService, { provide: PrismaService, useValue: prisma }],
        }).compile();
        service = module.get(PushSubscriptionsService);
    });

    describe("register", () => {
        it("upserts by endpoint and returns the view without keys", async () => {
            const result = await service.register(USER, DTO);

            expect(result).toEqual({
                id: "sub-1",
                endpoint: DTO.endpoint,
                deviceLabel: DTO.deviceLabel,
                createdAt: CREATED.toISOString(),
                lastSeenAt: SEEN.toISOString(),
                lastAcceptedAt: null,
            });
            expect(result).not.toHaveProperty("p256dh");
            expect(result).not.toHaveProperty("auth");
        });

        it("moves an endpoint registered by another user to the caller with a fresh lastSeenAt", async () => {
            const before = Date.now();

            await service.register(USER, DTO);

            const args = prisma.pushSubscription.upsert.mock.calls[0][0];
            expect(args.where).toEqual({ endpoint: DTO.endpoint });
            expect(args.update.userId).toBe(USER.id);
            expect(args.update.p256dh).toBe(DTO.keys.p256dh);
            expect(args.update.auth).toBe(DTO.keys.auth);
            expect(args.update.deviceLabel).toBe(DTO.deviceLabel);
            expect(args.update.lastSeenAt).toBeInstanceOf(Date);
            expect(args.update.lastSeenAt.getTime()).toBeGreaterThanOrEqual(before);
        });

        it("creates the row owned by the caller", async () => {
            await service.register(USER, DTO);

            const { create } = prisma.pushSubscription.upsert.mock.calls[0][0];
            expect(create).toMatchObject({
                userId: USER.id,
                endpoint: DTO.endpoint,
                p256dh: DTO.keys.p256dh,
                auth: DTO.keys.auth,
                deviceLabel: DTO.deviceLabel,
            });
        });

        it("rejects the demo account before writing", async () => {
            await expect(service.register(DEMO, DTO)).rejects.toBeInstanceOf(ForbiddenException);
            expect(prisma.pushSubscription.upsert).not.toHaveBeenCalled();
        });
    });

    describe("list", () => {
        it("returns the caller's subscriptions oldest first as ISO strings", async () => {
            prisma.pushSubscription.findMany.mockResolvedValue([
                {
                    id: "sub-1",
                    endpoint: DTO.endpoint,
                    deviceLabel: DTO.deviceLabel,
                    createdAt: CREATED,
                    lastSeenAt: SEEN,
                    lastAcceptedAt: ACCEPTED,
                },
            ]);

            const result = await service.list(USER.id);

            expect(prisma.pushSubscription.findMany).toHaveBeenCalledWith(
                expect.objectContaining({ where: { userId: USER.id, removedAt: null }, orderBy: { createdAt: "asc" } }),
            );
            expect(result).toEqual([
                {
                    id: "sub-1",
                    endpoint: DTO.endpoint,
                    deviceLabel: DTO.deviceLabel,
                    createdAt: CREATED.toISOString(),
                    lastSeenAt: SEEN.toISOString(),
                    lastAcceptedAt: ACCEPTED.toISOString(),
                },
            ]);
        });
    });

    describe("remove", () => {
        it("marks only the caller's row as removed instead of deleting it", async () => {
            await service.remove(USER.id, "sub-1");

            expect(prisma.pushSubscription.updateMany).toHaveBeenCalledWith({
                where: { id: "sub-1", userId: USER.id, removedAt: null },
                data: { removedAt: expect.any(Date) },
            });
            expect(prisma.pushSubscription.deleteMany).not.toHaveBeenCalled();
        });

        it("throws not found when the row belongs to someone else", async () => {
            prisma.pushSubscription.updateMany.mockResolvedValue({ count: 0 });

            await expect(service.remove(USER.id, "sub-of-other-user")).rejects.toBeInstanceOf(NotFoundException);
        });
    });

    describe("removed endpoints", () => {
        it("answers 410 to a quiet re-register of an endpoint the user removed, without upserting", async () => {
            prisma.pushSubscription.findUnique.mockResolvedValue({ removedAt: new Date("2026-11-10T09:00:00Z") });

            await expect(service.register(USER, DTO)).rejects.toBeInstanceOf(GoneException);
            expect(prisma.pushSubscription.upsert).not.toHaveBeenCalled();
        });

        it("answers 410 when another user removed the endpoint (the mark is per endpoint)", async () => {
            prisma.pushSubscription.findUnique.mockResolvedValue({ removedAt: new Date("2026-11-10T09:00:00Z") });

            await expect(service.register({ ...USER, id: "user-2" } as AuthUser, DTO)).rejects.toBeInstanceOf(
                GoneException,
            );
            expect(prisma.pushSubscription.upsert).not.toHaveBeenCalled();
        });

        it("upserts an endpoint that is not removed", async () => {
            prisma.pushSubscription.findUnique.mockResolvedValue({ removedAt: null });

            await service.register(USER, DTO);

            expect(prisma.pushSubscription.upsert).toHaveBeenCalled();
        });

        it("hides removed rows from the list", async () => {
            await service.list(USER.id);

            expect(prisma.pushSubscription.findMany).toHaveBeenCalledWith(
                expect.objectContaining({ where: { userId: USER.id, removedAt: null } }),
            );
        });
    });

    describe("unregister", () => {
        it("deletes by caller and endpoint", async () => {
            await service.unregister(USER.id, DTO.endpoint);

            expect(prisma.pushSubscription.deleteMany).toHaveBeenCalledWith({
                where: { userId: USER.id, endpoint: DTO.endpoint },
            });
        });

        it("is a no-op when nothing matched", async () => {
            prisma.pushSubscription.deleteMany.mockResolvedValue({ count: 0 });

            await expect(service.unregister(USER.id, DTO.endpoint)).resolves.toBeUndefined();
        });
    });
});
