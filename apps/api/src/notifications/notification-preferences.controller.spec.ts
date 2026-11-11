import { ForbiddenException } from "@nestjs/common";
import type { AuthUser } from "../auth/auth-user";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { NotificationPreferencesController } from "./notification-preferences.controller";
import { NotificationPreferencesService } from "./notification-preferences.service";

const USER = {
    id: "user-1",
    email: "owner@example.test",
    firstName: "Owner",
    lastName: "Test",
    role: "ADMIN",
    colorTheme: null,
    isDemo: false,
} as AuthUser;
const DEMO = { ...USER, id: "demo-1", role: "USER", email: "demo@demo.demo", isDemo: true } as AuthUser;

describe("NotificationPreferencesController", () => {
    let controller: NotificationPreferencesController;
    let prefs: { list: jest.Mock; update: jest.Mock };

    beforeEach(() => {
        prefs = {
            list: jest.fn().mockResolvedValue([]),
            update: jest.fn().mockResolvedValue([]),
        };
        controller = new NotificationPreferencesController(prefs as unknown as NotificationPreferencesService);
    });

    it("requires the JWT guard on the class", () => {
        expect(Reflect.getMetadata("__guards__", NotificationPreferencesController)).toContain(JwtAuthGuard);
    });

    it("GET lists preferences for the caller's id and role", async () => {
        await controller.list(USER);

        expect(prefs.list).toHaveBeenCalledWith({ id: USER.id, role: "ADMIN" });
    });

    it("PATCH forbids the demo account before touching preferences", async () => {
        const dto = { preferences: [{ type: "system.update-available" as const, enabled: false }] };

        await expect(controller.update(dto, DEMO)).rejects.toThrow(ForbiddenException);
        expect(prefs.update).not.toHaveBeenCalled();
    });

    it("PATCH delegates to the service with the caller's id and role and returns the new list", async () => {
        const dto = { preferences: [{ type: "system.update-available" as const, enabled: false }] };
        const updated = [
            {
                type: "system.update-available",
                label: "New version available",
                description: "When a new Badger Budget release is out (admins only).",
                enabled: false,
                mandatory: false,
            },
        ];
        prefs.update.mockResolvedValue(updated);

        await expect(controller.update(dto, USER)).resolves.toEqual(updated);
        expect(prefs.update).toHaveBeenCalledWith({ id: USER.id, role: "ADMIN" }, dto.preferences);
    });
});
