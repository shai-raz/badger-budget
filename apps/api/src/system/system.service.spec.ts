import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../prisma/prisma.service";
import { ChangelogService } from "./changelog.service";
import { SystemService } from "./system.service";
import { UpdateCheckService } from "./update-check.service";

describe("SystemService", () => {
    let service: SystemService;
    let env: Record<string, string | undefined>;
    let updateCheck: { getLatest: jest.Mock; forceCheck: jest.Mock; isEnabled: jest.Mock; getRepo: jest.Mock };
    let changelog: { getReleases: jest.Mock };
    let prisma: { user: { findUnique: jest.Mock; update: jest.Mock } };

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
                { provide: ChangelogService, useValue: changelog },
                { provide: PrismaService, useValue: prisma },
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
        changelog = {
            getReleases: jest.fn().mockReturnValue([
                {
                    version: "0.4.0",
                    date: "2026-10-23",
                    summary: null,
                    items: [{ type: "feat", scope: null, breaking: false, subject: "Four", pr: 9 }],
                },
                {
                    version: "0.2.0",
                    date: "2026-10-21",
                    summary: null,
                    items: [{ type: "fix", scope: null, breaking: false, subject: "Two", pr: null }],
                },
            ]),
        };
        prisma = { user: { findUnique: jest.fn().mockResolvedValue({ lastSeenVersion: null }), update: jest.fn() } };
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
            updateComparable: true,
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
        expect(info.updateComparable).toBe(false);
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

    describe("changelog", () => {
        it("returns the releases up to the running base version, with the user's stamp", async () => {
            env.APP_VERSION = "0.3.0-2-gabc1234";
            prisma.user.findUnique.mockResolvedValue({ lastSeenVersion: "0.2.0" });
            service = await build();

            const response = await service.getChangelog("user-1");

            expect(prisma.user.findUnique).toHaveBeenCalledWith({
                where: { id: "user-1" },
                select: { lastSeenVersion: true },
            });
            expect(response).toEqual({
                currentVersion: "0.3.0",
                lastSeenVersion: "0.2.0",
                showOnStart: true,
                releases: [
                    {
                        version: "0.2.0",
                        date: "2026-10-21",
                        summary: null,
                        items: [{ type: "fix", scope: null, breaking: false, subject: "Two", prUrl: null }],
                        unseen: false,
                    },
                ],
            });
        });

        it("stamps a never-seen user with the running version and reports it", async () => {
            env.APP_VERSION = "0.4.0";
            service = await build();

            await expect(service.markChangelogSeen("user-1")).resolves.toEqual({ lastSeenVersion: "0.4.0" });
            expect(prisma.user.update).toHaveBeenCalledWith({
                where: { id: "user-1" },
                data: { lastSeenVersion: "0.4.0" },
            });
        });

        it("does not write when the stored stamp is already at or above the running version", async () => {
            env.APP_VERSION = "0.3.0";
            prisma.user.findUnique.mockResolvedValue({ lastSeenVersion: "0.4.0" });
            service = await build();

            await expect(service.markChangelogSeen("user-1")).resolves.toEqual({ lastSeenVersion: "0.4.0" });
            expect(prisma.user.update).not.toHaveBeenCalled();
        });

        it("never lowers the stamp when the seen call comes from a build that is no longer the newest", async () => {
            env.APP_VERSION = "0.2.0";
            prisma.user.findUnique.mockResolvedValue({ lastSeenVersion: "0.4.0" });
            service = await build();

            await service.markChangelogSeen("user-1");

            expect(prisma.user.update).not.toHaveBeenCalled();
        });

        it("keeps a dev build's stamp at its base version", async () => {
            env.APP_VERSION = "0.4.0-dev";
            service = await build();

            await service.markChangelogSeen("user-1");

            expect(prisma.user.update).toHaveBeenCalledWith({
                where: { id: "user-1" },
                data: { lastSeenVersion: "0.4.0" },
            });
        });
    });
});
