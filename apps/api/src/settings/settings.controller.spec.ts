import { Test, TestingModule } from "@nestjs/testing";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { SettingsController } from "./settings.controller";
import { SettingsService } from "./settings.service";

describe("SettingsController", () => {
    let controller: SettingsController;
    let settings: { getSummary: jest.Mock };

    beforeEach(async () => {
        settings = {
            getSummary: jest.fn().mockResolvedValue({
                categories: 0,
                rules: 0,
                cardPayoffPatterns: 0,
                passkeys: 0,
                connectedApps: [],
            }),
        };
        const module: TestingModule = await Test.createTestingModule({
            controllers: [SettingsController],
            providers: [{ provide: SettingsService, useValue: settings }],
        }).compile();
        controller = module.get(SettingsController);
    });

    it("requires the JWT guard on every route", () => {
        expect(Reflect.getMetadata("__guards__", SettingsController)).toContain(JwtAuthGuard);
    });

    it("delegates getSummary to the service with the signed-in user id", async () => {
        const summary = {
            categories: 4,
            rules: 2,
            cardPayoffPatterns: 9,
            passkeys: 1,
            connectedApps: ["Claude"],
        };
        settings.getSummary.mockResolvedValue(summary);

        await expect(controller.getSummary({ id: "user-1" })).resolves.toEqual(summary);
        expect(settings.getSummary).toHaveBeenCalledWith("user-1");
    });
});
