import { Logger } from "@nestjs/common";
import { PushService } from "../notifications/push.service";
import { PrismaService } from "../prisma/prisma.service";
import { InstanceStateService } from "./instance-state.service";
import { LatestRelease, UpdateCheckService } from "./update-check.service";
import { UpdateNotifierService } from "./update-notifier.service";
import { UpgradeService } from "./upgrade.service";
import { SystemService } from "./system.service";

const KEY = "update-notifier.last-notified-version";
const ADMINS = [{ id: "admin-1" }, { id: "admin-2" }];
const TTL_SECONDS = 7 * 24 * 60 * 60;

describe("UpdateNotifierService", () => {
    let stored: unknown;
    let running: string | null;
    let updateCheck: { onSuccessfulCheck: jest.Mock };
    let system: { getRunningVersion: jest.Mock };
    let upgrade: { isConfigured: jest.Mock };
    let instanceState: { get: jest.Mock; set: jest.Mock };
    let prisma: { user: { findMany: jest.Mock } };
    let push: { send: jest.Mock };
    let errorSpy: jest.SpyInstance;
    let warnSpy: jest.SpyInstance;

    const release = (version: string): LatestRelease => ({
        version,
        url: `https://example.test/releases/v${version}`,
    });

    function build(): UpdateNotifierService {
        return new UpdateNotifierService(
            updateCheck as unknown as UpdateCheckService,
            system as unknown as SystemService,
            upgrade as unknown as UpgradeService,
            instanceState as unknown as InstanceStateService,
            prisma as unknown as PrismaService,
            push as unknown as PushService,
        );
    }

    /** Starts a notifier as a fresh process would, then runs the update check's success listener for `latest`. */
    async function checkFound(latest: LatestRelease): Promise<UpdateNotifierService> {
        const service = build();
        service.onModuleInit();
        const listener = updateCheck.onSuccessfulCheck.mock.calls[0][0] as (l: LatestRelease) => void;
        listener(latest);
        await service.whenIdle();
        return service;
    }

    beforeEach(() => {
        stored = null;
        running = "0.3.0";
        updateCheck = { onSuccessfulCheck: jest.fn() };
        system = { getRunningVersion: jest.fn(() => ({ version: running, commit: null })) };
        upgrade = { isConfigured: jest.fn().mockReturnValue(false) };
        instanceState = {
            get: jest.fn(async () => stored),
            set: jest.fn(async (_key: string, value: unknown) => {
                stored = value;
            }),
        };
        prisma = { user: { findMany: jest.fn().mockResolvedValue(ADMINS) } };
        push = { send: jest.fn().mockResolvedValue([]) };
        errorSpy = jest.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
        warnSpy = jest.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
        jest.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it("registers a success listener on module init", () => {
        build().onModuleInit();

        expect(updateCheck.onSuccessfulCheck).toHaveBeenCalledTimes(1);
    });

    it("saves the version before sending to each admin", async () => {
        await checkFound(release("0.4.0"));

        expect(instanceState.set).toHaveBeenCalledWith(KEY, { version: "0.4.0" });
        expect(prisma.user.findMany).toHaveBeenCalledWith({
            where: { role: "ADMIN", deletedAt: null },
            select: { id: true },
        });
        expect(push.send).toHaveBeenCalledTimes(2);
        expect(push.send).toHaveBeenNthCalledWith(
            1,
            { userId: "admin-1" },
            expect.objectContaining({ type: "system.update-available", url: "/?update=open" }),
            { ttl: TTL_SECONDS },
        );
        expect(push.send).toHaveBeenNthCalledWith(2, { userId: "admin-2" }, expect.any(Object), expect.any(Object));
        expect(instanceState.set.mock.invocationCallOrder[0]).toBeLessThan(push.send.mock.invocationCallOrder[0]);
    });

    it("sends nothing when the stored version already covers the release", async () => {
        stored = { version: "0.4.0" };

        await checkFound(release("0.4.0"));

        expect(instanceState.set).not.toHaveBeenCalled();
        expect(push.send).not.toHaveBeenCalled();
    });

    it("does not re-send after a restart when the stored version is the latest", async () => {
        stored = { version: "0.4.0" };

        await checkFound(release("0.4.0"));
        await checkFound(release("0.4.0"));

        expect(push.send).not.toHaveBeenCalled();
    });

    it("sends again for a release newer than the stored one", async () => {
        stored = { version: "0.4.0" };

        await checkFound(release("0.5.0"));

        expect(instanceState.set).toHaveBeenCalledWith(KEY, { version: "0.5.0" });
        expect(push.send).toHaveBeenCalledTimes(2);
    });

    it("treats a malformed stored value as nothing stored", async () => {
        stored = { version: 4 };

        await checkFound(release("0.4.0"));

        expect(push.send).toHaveBeenCalledTimes(2);
    });

    it("sends nothing and saves nothing when the release is not newer than the running build", async () => {
        await checkFound(release("0.3.0"));

        expect(instanceState.set).not.toHaveBeenCalled();
        expect(push.send).not.toHaveBeenCalled();
    });

    it("never notifies a dev build", async () => {
        running = "0.3.0-dev";

        await checkFound(release("0.4.0"));

        expect(instanceState.set).not.toHaveBeenCalled();
        expect(push.send).not.toHaveBeenCalled();
    });

    it("keeps the version saved when a push fails, and still tries the other admins", async () => {
        push.send.mockRejectedValueOnce(new Error("push service down")).mockResolvedValue([]);

        await checkFound(release("0.4.0"));

        expect(stored).toEqual({ version: "0.4.0" });
        expect(push.send).toHaveBeenCalledTimes(2);
        expect(warnSpy).toHaveBeenCalled();
    });

    it("sends nothing and logs when the version cannot be saved", async () => {
        instanceState.set.mockRejectedValueOnce(new Error("db down"));

        await checkFound(release("0.4.0"));

        expect(push.send).not.toHaveBeenCalled();
        expect(errorSpy).toHaveBeenCalled();
    });

    it("offers Upgrade now when the deploy webhook is configured", async () => {
        upgrade.isConfigured.mockReturnValue(true);

        await checkFound(release("0.4.0"));

        expect(push.send.mock.calls[0][1].actions).toEqual([
            { id: "upgrade-now", title: "Upgrade now", url: "/?update=upgrade" },
        ]);
    });

    it("offers How to upgrade when the deploy webhook is not configured", async () => {
        await checkFound(release("0.4.0"));

        expect(push.send.mock.calls[0][1].actions).toEqual([
            { id: "how-to-upgrade", title: "How to upgrade", url: "/?update=open" },
        ]);
    });

    it("serialises overlapping checks so one release is sent once", async () => {
        const service = build();
        service.onModuleInit();
        const listener = updateCheck.onSuccessfulCheck.mock.calls[0][0] as (l: LatestRelease) => void;

        listener(release("0.4.0"));
        listener(release("0.4.0"));
        await service.whenIdle();

        expect(push.send).toHaveBeenCalledTimes(2);
        expect(instanceState.set).toHaveBeenCalledTimes(1);
    });
});
