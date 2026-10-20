import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { AppConfigController } from "./app-config.controller";
import { RegistrationPolicyService } from "../auth/registration-policy.service";

describe("AppConfigController", () => {
    let controller: AppConfigController;
    let env: Record<string, string | undefined>;
    let registrationPolicy: { isRegistrationOpen: jest.Mock };

    beforeEach(async () => {
        env = {};
        registrationPolicy = { isRegistrationOpen: jest.fn().mockResolvedValue(false) };

        const module: TestingModule = await Test.createTestingModule({
            controllers: [AppConfigController],
            providers: [
                { provide: ConfigService, useValue: { get: jest.fn((key: string) => env[key]) } },
                { provide: RegistrationPolicyService, useValue: registrationPolicy },
            ],
        }).compile();

        controller = module.get<AppConfigController>(AppConfigController);
    });

    it("reports every flag false when nothing is configured", async () => {
        registrationPolicy.isRegistrationOpen.mockResolvedValue(false);

        await expect(controller.getConfig()).resolves.toEqual({
            registrationOpen: false,
            googleSheetsEnabled: false,
            fxEnabled: false,
        });
    });

    it("reports registrationOpen from the registration policy", async () => {
        registrationPolicy.isRegistrationOpen.mockResolvedValue(true);

        const result = await controller.getConfig();

        expect(result.registrationOpen).toBe(true);
        expect(registrationPolicy.isRegistrationOpen).toHaveBeenCalledTimes(1);
    });

    it("enables Google Sheets only when both service-account variables are set", async () => {
        env.GOOGLE_SHEETS_CLIENT_EMAIL = "svc@example.iam.gserviceaccount.com";
        expect((await controller.getConfig()).googleSheetsEnabled).toBe(false);

        env.GOOGLE_SHEETS_PRIVATE_KEY = "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----";
        expect((await controller.getConfig()).googleSheetsEnabled).toBe(true);
    });

    it("treats whitespace-only Google Sheets variables as unset", async () => {
        env.GOOGLE_SHEETS_CLIENT_EMAIL = "   ";
        env.GOOGLE_SHEETS_PRIVATE_KEY = "\t\n";

        expect((await controller.getConfig()).googleSheetsEnabled).toBe(false);
    });

    it("enables FX only when FREE_CURRENCY_API_KEY is non-blank", async () => {
        expect((await controller.getConfig()).fxEnabled).toBe(false);

        env.FREE_CURRENCY_API_KEY = "   ";
        expect((await controller.getConfig()).fxEnabled).toBe(false);

        env.FREE_CURRENCY_API_KEY = "key-123";
        expect((await controller.getConfig()).fxEnabled).toBe(true);
    });
});
