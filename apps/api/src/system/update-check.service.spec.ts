import { Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { UpdateCheckService } from "./update-check.service";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const RELEASE_URL = "https://github.com/shai-raz/badger-budget/releases/tag/v0.4.0";

function releaseResponse(tag = "v0.4.0", url = RELEASE_URL): Response {
    return { ok: true, status: 200, json: async () => ({ tag_name: tag, html_url: url }) } as unknown as Response;
}

function statusResponse(status: number): Response {
    return { ok: false, status, json: async () => ({}) } as unknown as Response;
}

describe("UpdateCheckService", () => {
    let env: Record<string, string | undefined>;
    let fetchMock: jest.Mock;
    let originalFetch: typeof fetch;
    let warnSpy: jest.SpyInstance;

    const build = () => new UpdateCheckService({ get: jest.fn((key: string) => env[key]) } as unknown as ConfigService);

    beforeEach(() => {
        jest.useFakeTimers();
        jest.setSystemTime(new Date("2026-10-23T12:00:00Z"));
        env = {};
        originalFetch = global.fetch;
        fetchMock = jest.fn().mockResolvedValue(releaseResponse());
        global.fetch = fetchMock as unknown as typeof fetch;
        warnSpy = jest.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
    });

    afterEach(() => {
        global.fetch = originalFetch;
        warnSpy.mockRestore();
        jest.useRealTimers();
    });

    describe("caching", () => {
        it("fetches once on first call and serves the cache afterwards", async () => {
            const service = build();

            const first = await service.getLatest();
            const second = await service.getLatest();

            expect(fetchMock).toHaveBeenCalledTimes(1);
            expect(first.latest).toEqual({ version: "0.4.0", url: RELEASE_URL });
            expect(first.checkedAt).toEqual(new Date("2026-10-23T12:00:00Z"));
            expect(second).toEqual(first);
        });

        it("refetches once the last successful check is 24 hours old", async () => {
            const service = build();
            await service.getLatest();

            jest.advanceTimersByTime(DAY - 1);
            await service.getLatest();
            expect(fetchMock).toHaveBeenCalledTimes(1);

            jest.advanceTimersByTime(1);
            await service.getLatest();
            expect(fetchMock).toHaveBeenCalledTimes(2);
        });

        it("shares one request between concurrent callers", async () => {
            const service = build();

            const [a, b] = await Promise.all([service.getLatest(), service.getLatest()]);

            expect(fetchMock).toHaveBeenCalledTimes(1);
            expect(a.latest?.version).toBe("0.4.0");
            expect(b).toEqual(a);
        });

        it("strips the leading v from the release tag", async () => {
            fetchMock.mockResolvedValueOnce(releaseResponse("v1.2.3"));

            const { latest } = await build().getLatest();

            expect(latest?.version).toBe("1.2.3");
        });
    });

    describe("failures", () => {
        it("logs one warning, keeps latest null and does not throw when the request fails", async () => {
            fetchMock.mockRejectedValueOnce(new Error("network down"));

            const result = await build().getLatest();

            expect(result).toEqual({ latest: null, checkedAt: null });
            expect(warnSpy).toHaveBeenCalledTimes(1);
            expect(warnSpy).toHaveBeenCalledWith("Update check failed: network down");
        });

        it("retries a failed check only after one hour", async () => {
            const service = build();
            fetchMock.mockRejectedValueOnce(new Error("timeout"));
            await service.getLatest();

            jest.advanceTimersByTime(HOUR - 1);
            await service.getLatest();
            expect(fetchMock).toHaveBeenCalledTimes(1);

            jest.advanceTimersByTime(1);
            const result = await service.getLatest();
            expect(fetchMock).toHaveBeenCalledTimes(2);
            expect(result.latest?.version).toBe("0.4.0");
        });

        it("treats a 404 (no release published) as a failure", async () => {
            fetchMock.mockResolvedValueOnce(statusResponse(404));

            const result = await build().getLatest();

            expect(result).toEqual({ latest: null, checkedAt: null });
            expect(warnSpy).toHaveBeenCalledWith("Update check failed: GitHub responded 404");
        });

        it("keeps the previous release and its check time when a later check fails", async () => {
            const service = build();
            const good = await service.getLatest();

            jest.advanceTimersByTime(DAY);
            fetchMock.mockRejectedValueOnce(new Error("offline"));
            const after = await service.getLatest();

            expect(after).toEqual(good);
        });

        it("treats a payload without tag_name or html_url as a failure", async () => {
            fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({}) } as unknown as Response);

            const result = await build().getLatest();

            expect(result.latest).toBeNull();
            expect(warnSpy).toHaveBeenCalledWith("Update check failed: unexpected release payload");
        });
    });

    describe("forceCheck", () => {
        it("fetches immediately even when the cache is still fresh", async () => {
            const service = build();
            await service.getLatest();

            jest.advanceTimersByTime(60_001);
            await service.forceCheck();

            expect(fetchMock).toHaveBeenCalledTimes(2);
        });

        it("does not fetch again within the 60 second cooldown and returns the same checkedAt", async () => {
            const service = build();
            const first = await service.forceCheck();

            jest.advanceTimersByTime(59_000);
            const second = await service.forceCheck();

            expect(fetchMock).toHaveBeenCalledTimes(1);
            expect(second.checkedAt).toEqual(first.checkedAt);
        });

        it("respects the cooldown after a failed attempt too", async () => {
            fetchMock.mockRejectedValueOnce(new Error("down"));
            const service = build();
            await service.forceCheck();

            await service.forceCheck();

            expect(fetchMock).toHaveBeenCalledTimes(1);
        });
    });

    describe("opt-out", () => {
        it.each(["false", "FALSE", " false "])("UPDATE_CHECK=%j makes no requests at all", async (value) => {
            env.UPDATE_CHECK = value;
            const service = build();

            service.onApplicationBootstrap();
            const cached = await service.getLatest();
            const forced = await service.forceCheck();

            expect(fetchMock).not.toHaveBeenCalled();
            expect(cached).toEqual({ latest: null, checkedAt: null });
            expect(forced).toEqual({ latest: null, checkedAt: null });
            expect(service.isEnabled()).toBe(false);
        });

        it("an empty UPDATE_CHECK leaves the check on", async () => {
            env.UPDATE_CHECK = "";
            const service = build();

            await service.getLatest();

            expect(service.isEnabled()).toBe(true);
            expect(fetchMock).toHaveBeenCalledTimes(1);
        });
    });

    describe("bootstrap", () => {
        it("warms the cache in the background when enabled", () => {
            build().onApplicationBootstrap();

            expect(fetchMock).toHaveBeenCalledTimes(1);
        });
    });

    describe("repository", () => {
        it("defaults to the upstream repository", async () => {
            await build().getLatest();

            expect(fetchMock).toHaveBeenCalledWith(
                "https://api.github.com/repos/shai-raz/badger-budget/releases/latest",
                expect.anything(),
            );
        });

        it("uses a trimmed UPDATE_CHECK_REPO for forks", async () => {
            env.UPDATE_CHECK_REPO = "  acme/budget-fork ";

            await build().getLatest();

            expect(fetchMock).toHaveBeenCalledWith(
                "https://api.github.com/repos/acme/budget-fork/releases/latest",
                expect.objectContaining({
                    headers: expect.objectContaining({ "User-Agent": "badger-budget-update-check" }),
                }),
            );
        });

        it("falls back to the default when UPDATE_CHECK_REPO is blank", () => {
            env.UPDATE_CHECK_REPO = "   ";

            expect(build().getRepo()).toBe("shai-raz/badger-budget");
        });
    });
});
