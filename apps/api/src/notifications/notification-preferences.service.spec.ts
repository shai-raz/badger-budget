import { BadRequestException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import type { NotificationTypeRegistry } from "@badger/shared-data";
import type { INotificationPreference } from "@badger/types";
import { PrismaService } from "../prisma/prisma.service";
import { NotificationPreferencesService, type NotificationUser } from "./notification-preferences.service";
import { NOTIFICATION_MANDATORY_RULES, NOTIFICATION_REGISTRY, type MandatoryRules } from "./notifications.tokens";

const fixtureRegistry: NotificationTypeRegistry<string> = {
    "fixture.normal": {
        label: "Normal",
        description: "Normal type",
        defaultEnabled: true,
        mandatory: false,
        listed: true,
    },
    "fixture.muted": {
        label: "Muted",
        description: "Off by default",
        defaultEnabled: false,
        mandatory: false,
        listed: true,
    },
    "fixture.admin-only": {
        label: "Admin only",
        description: "Admins",
        defaultEnabled: true,
        roles: ["ADMIN"],
        mandatory: false,
        listed: true,
    },
    "fixture.mandatory": {
        label: "Mandatory",
        description: "Always on",
        defaultEnabled: true,
        mandatory: true,
        listed: true,
    },
    "fixture.conditional": {
        label: "Conditional",
        description: "Mandatory for some users",
        defaultEnabled: true,
        mandatory: false,
        listed: true,
    },
    "fixture.unlisted": {
        label: "Unlisted",
        description: "Hidden",
        defaultEnabled: true,
        mandatory: false,
        listed: false,
    },
};

const USER: NotificationUser = { id: "user-1", role: "USER" };
const ADMIN: NotificationUser = { id: "admin-1", role: "ADMIN" };

const rowFor = (rows: INotificationPreference[], type: string) => rows.find((row) => row.type === type);

describe("NotificationPreferencesService", () => {
    let service: NotificationPreferencesService;
    let prisma: {
        notificationPreference: {
            findMany: jest.Mock;
            findUnique: jest.Mock;
            deleteMany: jest.Mock;
            upsert: jest.Mock;
        };
        $transaction: jest.Mock;
    };
    let conditionalRule: jest.Mock;

    beforeEach(async () => {
        prisma = {
            notificationPreference: {
                findMany: jest.fn().mockResolvedValue([]),
                findUnique: jest.fn().mockResolvedValue(null),
                deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
                upsert: jest.fn().mockResolvedValue({}),
            },
            $transaction: jest.fn(),
        };
        prisma.$transaction.mockImplementation((cb: (tx: unknown) => unknown) => cb(prisma));
        conditionalRule = jest.fn(async (userId: string) => userId === USER.id);
        const rules: MandatoryRules = { "fixture.conditional": conditionalRule };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                NotificationPreferencesService,
                { provide: PrismaService, useValue: prisma },
                { provide: NOTIFICATION_REGISTRY, useValue: fixtureRegistry },
                { provide: NOTIFICATION_MANDATORY_RULES, useValue: rules },
            ],
        }).compile();

        service = module.get(NotificationPreferencesService);
    });

    describe("allowedFor", () => {
        it("opens a type without roles to everyone", () => {
            expect(service.allowedFor("fixture.normal", "USER")).toBe(true);
            expect(service.allowedFor("fixture.normal", "ADMIN")).toBe(true);
        });

        it("limits a role-restricted type to its roles", () => {
            expect(service.allowedFor("fixture.admin-only", "ADMIN")).toBe(true);
            expect(service.allowedFor("fixture.admin-only", "USER")).toBe(false);
        });

        it("never allows an unknown type, including inherited object keys", () => {
            expect(service.allowedFor("fixture.missing", "ADMIN")).toBe(false);
            expect(service.allowedFor("constructor", "ADMIN")).toBe(false);
        });
    });

    describe("isMandatory", () => {
        it("is true for a mandatory type without consulting rules", async () => {
            await expect(service.isMandatory("fixture.mandatory", USER.id)).resolves.toBe(true);
            expect(conditionalRule).not.toHaveBeenCalled();
        });

        it("evaluates a conditional rule per user", async () => {
            await expect(service.isMandatory("fixture.conditional", "user-1")).resolves.toBe(true);
            await expect(service.isMandatory("fixture.conditional", "user-2")).resolves.toBe(false);
        });

        it("is false for an ordinary type", async () => {
            await expect(service.isMandatory("fixture.normal", USER.id)).resolves.toBe(false);
        });
    });

    describe("list", () => {
        it("returns the listed types the role may receive, in registry order, with effective values", async () => {
            prisma.notificationPreference.findMany.mockResolvedValue([
                { type: "fixture.normal", enabled: false },
                { type: "fixture.muted", enabled: true },
                { type: "fixture.mandatory", enabled: false },
            ]);

            await expect(service.list(USER)).resolves.toEqual([
                {
                    type: "fixture.normal",
                    label: "Normal",
                    description: "Normal type",
                    enabled: false,
                    mandatory: false,
                },
                {
                    type: "fixture.muted",
                    label: "Muted",
                    description: "Off by default",
                    enabled: true,
                    mandatory: false,
                },
                {
                    type: "fixture.mandatory",
                    label: "Mandatory",
                    description: "Always on",
                    enabled: true,
                    mandatory: true,
                },
                {
                    type: "fixture.conditional",
                    label: "Conditional",
                    description: "Mandatory for some users",
                    enabled: true,
                    mandatory: true,
                },
            ]);
        });

        it("includes role-restricted types for a matching role and falls back to defaults", async () => {
            const rows = await service.list(ADMIN);

            expect(rows.map((row) => row.type)).toEqual([
                "fixture.normal",
                "fixture.muted",
                "fixture.admin-only",
                "fixture.mandatory",
                "fixture.conditional",
            ]);
            expect(rowFor(rows, "fixture.muted")?.enabled).toBe(false);
        });

        it("never lists an unlisted type", async () => {
            const rows = await service.list(ADMIN);

            expect(rows.map((row) => row.type)).not.toContain("fixture.unlisted");
        });
    });

    describe("update", () => {
        it.each([
            ["an unknown type", "fixture.missing"],
            ["an unlisted type", "fixture.unlisted"],
            ["a role-disallowed type", "fixture.admin-only"],
        ])("rejects %s without writing", async (_label, type) => {
            await expect(service.update(USER, [{ type, enabled: false }])).rejects.toThrow(BadRequestException);

            expect(prisma.$transaction).not.toHaveBeenCalled();
        });

        it("rejects turning off a mandatory type", async () => {
            await expect(service.update(USER, [{ type: "fixture.mandatory", enabled: false }])).rejects.toThrow(
                BadRequestException,
            );
        });

        it("rejects turning off a type that is mandatory for this user", async () => {
            await expect(service.update(USER, [{ type: "fixture.conditional", enabled: false }])).rejects.toThrow(
                BadRequestException,
            );
        });

        it("writes nothing when any entry is invalid", async () => {
            await expect(
                service.update(USER, [
                    { type: "fixture.muted", enabled: true },
                    { type: "fixture.missing", enabled: true },
                ]),
            ).rejects.toThrow(BadRequestException);

            expect(prisma.notificationPreference.upsert).not.toHaveBeenCalled();
            expect(prisma.notificationPreference.deleteMany).not.toHaveBeenCalled();
        });

        it("deletes the override when the value equals the default", async () => {
            await service.update(USER, [{ type: "fixture.normal", enabled: true }]);

            expect(prisma.notificationPreference.deleteMany).toHaveBeenCalledWith({
                where: { userId: USER.id, type: "fixture.normal" },
            });
            expect(prisma.notificationPreference.upsert).not.toHaveBeenCalled();
        });

        it("upserts the override when the value differs from the default", async () => {
            await service.update(USER, [{ type: "fixture.muted", enabled: true }]);

            expect(prisma.notificationPreference.upsert).toHaveBeenCalledWith({
                where: { userId_type: { userId: USER.id, type: "fixture.muted" } },
                create: { userId: USER.id, type: "fixture.muted", enabled: true },
                update: { enabled: true },
            });
            expect(prisma.notificationPreference.deleteMany).not.toHaveBeenCalled();
        });

        it("returns the list after writing", async () => {
            prisma.notificationPreference.findMany.mockResolvedValue([{ type: "fixture.muted", enabled: true }]);

            const rows = await service.update(USER, [{ type: "fixture.muted", enabled: true }]);

            expect(rowFor(rows, "fixture.muted")?.enabled).toBe(true);
        });
    });

    describe("shouldSend", () => {
        it("is false for a role-disallowed type without reading the stored row", async () => {
            await expect(service.shouldSend(USER, "fixture.admin-only")).resolves.toBe(false);
            expect(prisma.notificationPreference.findUnique).not.toHaveBeenCalled();
        });

        it("is false for an unknown type", async () => {
            await expect(service.shouldSend(USER, "fixture.missing")).resolves.toBe(false);
        });

        it("is true for a mandatory type even when a stored row disables it", async () => {
            prisma.notificationPreference.findUnique.mockResolvedValue({ enabled: false });

            await expect(service.shouldSend(USER, "fixture.mandatory")).resolves.toBe(true);
        });

        it("is true for a conditional type while the rule holds", async () => {
            prisma.notificationPreference.findUnique.mockResolvedValue({ enabled: false });

            await expect(service.shouldSend(USER, "fixture.conditional")).resolves.toBe(true);
        });

        it("uses the stored value over the default", async () => {
            prisma.notificationPreference.findUnique.mockResolvedValue({ enabled: true });
            await expect(service.shouldSend(USER, "fixture.muted")).resolves.toBe(true);

            prisma.notificationPreference.findUnique.mockResolvedValue({ enabled: false });
            await expect(service.shouldSend(USER, "fixture.normal")).resolves.toBe(false);
        });

        it("falls back to the default when there is no stored row", async () => {
            await expect(service.shouldSend(USER, "fixture.normal")).resolves.toBe(true);
            await expect(service.shouldSend(USER, "fixture.muted")).resolves.toBe(false);
        });
    });
});
