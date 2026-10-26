import { Test, TestingModule } from "@nestjs/testing";
import { UserRole } from "@prisma/client";
import { AdminGuard } from "../auth/guards/admin.guard";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { SystemController } from "./system.controller";
import { SystemService } from "./system.service";
import { UpgradeService } from "./upgrade.service";

describe("SystemController", () => {
    let controller: SystemController;
    let system: {
        getInfo: jest.Mock;
        checkForUpdates: jest.Mock;
        getChangelog: jest.Mock;
        markChangelogSeen: jest.Mock;
    };
    let upgradeService: { trigger: jest.Mock };

    beforeEach(async () => {
        system = {
            getInfo: jest.fn().mockResolvedValue({ version: "0.3.0" }),
            checkForUpdates: jest.fn().mockResolvedValue({ version: "0.3.0" }),
            getChangelog: jest.fn().mockResolvedValue({ currentVersion: "0.3.0", releases: [] }),
            markChangelogSeen: jest.fn().mockResolvedValue({ lastSeenVersion: "0.3.0" }),
        };
        upgradeService = { trigger: jest.fn().mockResolvedValue({ targetVersion: "0.4.0" }) };
        const module: TestingModule = await Test.createTestingModule({
            controllers: [SystemController],
            providers: [
                { provide: SystemService, useValue: system },
                { provide: UpgradeService, useValue: upgradeService },
            ],
        }).compile();
        controller = module.get(SystemController);
    });

    it("requires the JWT guard on every route", () => {
        expect(Reflect.getMetadata("__guards__", SystemController)).toContain(JwtAuthGuard);
    });

    it("GET info delegates to the service with the signed-in user", async () => {
        const user = { id: "user-1", role: UserRole.ADMIN };

        await expect(controller.getInfo(user)).resolves.toEqual({ version: "0.3.0" });
        expect(system.getInfo).toHaveBeenCalledWith(user);
    });

    it("POST check-updates delegates to the service with the signed-in user", async () => {
        const user = { id: "user-1", role: UserRole.USER };

        await expect(controller.checkForUpdates(user)).resolves.toEqual({ version: "0.3.0" });
        expect(system.checkForUpdates).toHaveBeenCalledWith(user);
    });

    describe("POST upgrade", () => {
        it("is guarded by the admin guard on top of the class-level JWT guard", () => {
            expect(Reflect.getMetadata("__guards__", SystemController.prototype.upgrade)).toContain(AdminGuard);
            expect(Reflect.getMetadata("__guards__", SystemController)).toContain(JwtAuthGuard);
        });

        it("answers 202 Accepted", () => {
            expect(Reflect.getMetadata("__httpCode__", SystemController.prototype.upgrade)).toBe(202);
        });

        it("triggers the deploy webhook for the signed-in user and returns the target version", async () => {
            await expect(controller.upgrade({ id: "user-1" })).resolves.toEqual({ targetVersion: "0.4.0" });
            expect(upgradeService.trigger).toHaveBeenCalledWith("user-1");
        });
    });

    it("GET changelog passes the signed-in user to the service", async () => {
        await expect(controller.getChangelog({ id: "user-1" })).resolves.toEqual({
            currentVersion: "0.3.0",
            releases: [],
        });
        expect(system.getChangelog).toHaveBeenCalledWith("user-1");
    });

    it("POST changelog/seen passes the signed-in user to the service", async () => {
        await expect(controller.markChangelogSeen({ id: "user-1" })).resolves.toEqual({ lastSeenVersion: "0.3.0" });
        expect(system.markChangelogSeen).toHaveBeenCalledWith("user-1");
    });
});
