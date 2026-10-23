import { Test, TestingModule } from "@nestjs/testing";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { SystemController } from "./system.controller";
import { SystemService } from "./system.service";

describe("SystemController", () => {
    let controller: SystemController;
    let system: { getInfo: jest.Mock; checkForUpdates: jest.Mock };

    beforeEach(async () => {
        system = {
            getInfo: jest.fn().mockResolvedValue({ version: "0.3.0" }),
            checkForUpdates: jest.fn().mockResolvedValue({ version: "0.3.0" }),
        };
        const module: TestingModule = await Test.createTestingModule({
            controllers: [SystemController],
            providers: [{ provide: SystemService, useValue: system }],
        }).compile();
        controller = module.get(SystemController);
    });

    it("requires the JWT guard on every route", () => {
        expect(Reflect.getMetadata("__guards__", SystemController)).toContain(JwtAuthGuard);
    });

    it("GET info delegates to the service", async () => {
        await expect(controller.getInfo()).resolves.toEqual({ version: "0.3.0" });
        expect(system.getInfo).toHaveBeenCalledTimes(1);
    });

    it("POST check-updates delegates to the service", async () => {
        await expect(controller.checkForUpdates()).resolves.toEqual({ version: "0.3.0" });
        expect(system.checkForUpdates).toHaveBeenCalledTimes(1);
    });
});
