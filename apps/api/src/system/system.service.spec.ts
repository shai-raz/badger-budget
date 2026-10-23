import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { SystemService } from "./system.service";
import { UpdateCheckService } from "./update-check.service";

describe("SystemService", () => {
    let service: SystemService;
    let env: Record<string, string | undefined>;
    let updateCheck: { getLatest: jest.Mock; forceCheck: jest.Mock; isEnabled: jest.Mock; getRepo: jest.Mock };

    const release = {
        latest: { version: "0.4.0", url: "https://example.test/releases/v0.4.0" },
        checkedAt: new Date("2026-10-23T10:00:00Z"),
    };

    async function build(): Promise<SystemService> {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                SystemService,
                { provide: ConfigService, useValue: { get: jest.fn((key: string) => env[key]) } },
                { provide: UpdateCheckService, useValue: updateCheck },
            ],
        }).compile();
        return module.get(SystemService);
    }

    beforeEach(async () => {
        env = {};
        updateCheck = {
            getLatest: jest.fn().mockResolvedValue(release),
            forceCheck: jest.fn().mockResolvedValue(release),
            isEnabled: jest.fn().mockReturnValue(true),
            getRepo: jest.fn().mockReturnValue("shai-raz/badger-budget"),
        };
        service = await build();
    });

    it("reports an update when a newer release than the running build exists", async () => {
        env.APP_VERSION = "0.3.0";
        service = await build();

        const info = await service.getInfo();

        expect(info).toEqual({
            version: "0.3.0",
            commit: null,
            latest: "0.4.0",
            updateAvailable: true,
            checkedAt: "2026-10-23T10:00:00.000Z",
            updateCheckEnabled: true,
            releaseUrl: "https://example.test/releases/v0.4.0",
        });
    });

    it("reports the commit from GIT_SHA", async () => {
        env.APP_VERSION = "0.4.0";
        env.GIT_SHA = "9e42c5d7fa0123456789abcdef0123456789abcd";
        service = await build();

        expect((await service.getInfo()).commit).toBe("9e42c5d7fa0123456789abcdef0123456789abcd");
    });

    it("never reports an update for a dev build", async () => {
        const info = await service.getInfo();

        expect(info.version).toMatch(/-dev$/);
        expect(info.updateAvailable).toBe(false);
    });

    it("reports no latest release and no update when the check is disabled", async () => {
        updateCheck.isEnabled.mockReturnValue(false);
        updateCheck.getLatest.mockResolvedValue({ latest: null, checkedAt: null });
        env.APP_VERSION = "0.3.0";
        service = await build();

        const info = await service.getInfo();

        expect(info).toEqual(
            expect.objectContaining({
                latest: null,
                updateAvailable: false,
                checkedAt: null,
                updateCheckEnabled: false,
                releaseUrl: null,
            }),
        );
    });

    it("reads the cache on getInfo and forces a check on checkForUpdates", async () => {
        await service.getInfo();
        expect(updateCheck.getLatest).toHaveBeenCalledTimes(1);
        expect(updateCheck.forceCheck).not.toHaveBeenCalled();

        await service.checkForUpdates();
        expect(updateCheck.forceCheck).toHaveBeenCalledTimes(1);
    });

    it("exposes the running version and the repository", async () => {
        env.APP_VERSION = "0.3.0";
        service = await build();

        expect(service.getRunningVersion()).toEqual({ version: "0.3.0", commit: null });
        expect(service.getRepo()).toBe("shai-raz/badger-budget");
    });
});
