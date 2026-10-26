import { BadGatewayException, ConflictException, Logger, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { UpdateCheckService } from "./update-check.service";
import { UpgradeService } from "./upgrade.service";

const WEBHOOK_URL = "https://deploy.example.test/hooks/badger-secret-path";
const TOKEN = "tok-very-secret-value";
const BODY = '{"ref":"main"}';
const RELEASE_URL = "https://github.com/shai-raz/badger-budget/releases/tag/v0.6.0";

function response(status: number, cancel = jest.fn().mockResolvedValue(undefined)): Response {
    return { status, body: { cancel } } as unknown as Response;
}

async function captureError(promise: Promise<unknown>): Promise<unknown> {
    try {
        await promise;
    } catch (error) {
        return error;
    }
    throw new Error("expected the promise to reject");
}

describe("UpgradeService", () => {
    let env: Record<string, string | undefined>;
    let fetchMock: jest.Mock;
    let originalFetch: typeof fetch;
    let updateCheck: { getLatest: jest.Mock };
    let warnSpy: jest.SpyInstance;
    let logSpy: jest.SpyInstance;

    const build = () =>
        new UpgradeService(
            { get: jest.fn((key: string) => env[key]) } as unknown as ConfigService,
            updateCheck as unknown as UpdateCheckService,
        );

    const configured = () => {
        env = { DEPLOY_WEBHOOK_URL: WEBHOOK_URL, DEPLOY_WEBHOOK_TOKEN: TOKEN, DEPLOY_WEBHOOK_BODY: BODY };
    };

    /** Every string the logger received, so a secret in any log line is caught. */
    const allLogText = () => JSON.stringify([...warnSpy.mock.calls, ...logSpy.mock.calls]);

    beforeEach(() => {
        jest.useFakeTimers();
        jest.setSystemTime(new Date("2026-10-26T12:00:00Z"));
        env = {};
        originalFetch = global.fetch;
        fetchMock = jest.fn().mockResolvedValue(response(200));
        global.fetch = fetchMock as unknown as typeof fetch;
        updateCheck = {
            getLatest: jest.fn().mockResolvedValue({
                latest: { version: "0.6.0", url: RELEASE_URL },
                checkedAt: new Date("2026-10-26T11:00:00Z"),
            }),
        };
        warnSpy = jest.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
        logSpy = jest.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
    });

    afterEach(() => {
        global.fetch = originalFetch;
        warnSpy.mockRestore();
        logSpy.mockRestore();
        jest.useRealTimers();
    });

    describe("unconfigured", () => {
        it("reports not configured and throws NotFound without calling fetch", async () => {
            const service = build();

            expect(service.isConfigured()).toBe(false);
            const error = await captureError(service.trigger("user-1"));

            expect(error).toBeInstanceOf(NotFoundException);
            expect((error as Error).message).toBe("In-app upgrade is not configured on this instance");
            expect(fetchMock).not.toHaveBeenCalled();
        });

        it("disables the feature and warns without echoing the body when the body is invalid", () => {
            env = { DEPLOY_WEBHOOK_URL: WEBHOOK_URL, DEPLOY_WEBHOOK_BODY: "{not-json-SECRET-BODY" };

            const service = build();

            expect(service.isConfigured()).toBe(false);
            expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("DEPLOY_WEBHOOK_BODY"));
            expect(allLogText()).not.toContain("SECRET-BODY");
        });
    });

    describe("configured", () => {
        it("reports configured", () => {
            configured();

            expect(build().isConfigured()).toBe(true);
        });

        it("posts to the exact URL with the parsed headers and body and manual redirects", async () => {
            configured();

            await build().trigger("user-1");

            expect(fetchMock).toHaveBeenCalledTimes(1);
            expect(fetchMock).toHaveBeenCalledWith(WEBHOOK_URL, {
                method: "POST",
                headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
                body: BODY,
                redirect: "manual",
                signal: expect.any(AbortSignal),
            });
        });

        it("returns the latest version on 200 and cancels the body without reading it", async () => {
            configured();
            const cancel = jest.fn().mockResolvedValue(undefined);
            fetchMock.mockResolvedValueOnce(response(200, cancel));

            const result = await build().trigger("user-1");

            expect(result).toEqual({ targetVersion: "0.6.0" });
            expect(cancel).toHaveBeenCalledTimes(1);
            expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("triggered by user user-1: HTTP 200"));
        });

        it("returns a null target version when no release is known", async () => {
            configured();
            updateCheck.getLatest.mockResolvedValueOnce({ latest: null, checkedAt: null });

            await expect(build().trigger("user-1")).resolves.toEqual({ targetVersion: null });
        });

        it.each([401, 500])("throws BadGateway with HTTP %i and logs no secret", async (status) => {
            configured();
            fetchMock.mockResolvedValueOnce(response(status));

            const error = await captureError(build().trigger("user-1"));

            expect(error).toBeInstanceOf(BadGatewayException);
            expect((error as Error).message).toBe(`The host rejected the deploy request (HTTP ${status})`);
            expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining(`HTTP ${status}`));
            expect(JSON.stringify(error)).not.toContain(TOKEN);
            expect(allLogText()).not.toContain(WEBHOOK_URL);
            expect(allLogText()).not.toContain(TOKEN);
        });

        it("treats a 3xx from the manual redirect as a rejection", async () => {
            configured();
            fetchMock.mockResolvedValueOnce(response(302));

            const error = await captureError(build().trigger("user-1"));

            expect(error).toBeInstanceOf(BadGatewayException);
            expect((error as Error).message).toBe("The host rejected the deploy request (HTTP 302)");
        });

        it("reports a redirect when the status is 0", async () => {
            configured();
            fetchMock.mockResolvedValueOnce(response(0));

            const error = await captureError(build().trigger("user-1"));

            expect((error as Error).message).toBe("The host rejected the deploy request (HTTP redirect)");
        });

        it.each([
            ["timeout", new DOMException("The operation was aborted due to timeout", "TimeoutError")],
            [
                "network",
                Object.assign(new TypeError("fetch failed"), { cause: new Error(`connect refused ${WEBHOOK_URL}`) }),
            ],
            ["invalid-request", new TypeError("invalid header value")],
        ])("maps a %s fetch failure to BadGateway without logging the URL or token", async (kind, failure) => {
            configured();
            fetchMock.mockRejectedValueOnce(failure);

            const error = await captureError(build().trigger("user-1"));

            expect(error).toBeInstanceOf(BadGatewayException);
            expect((error as Error).message).toBe("Could not reach the deploy webhook");
            expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining(`(${kind})`));
            expect(JSON.stringify(error)).not.toContain(WEBHOOK_URL);
            expect(allLogText()).not.toContain(WEBHOOK_URL);
            expect(allLogText()).not.toContain(TOKEN);
        });

        it("keeps the lock open for 2 minutes after a success, then allows a new trigger", async () => {
            configured();
            const service = build();
            await service.trigger("user-1");

            const blocked = await captureError(service.trigger("user-1"));
            expect(blocked).toBeInstanceOf(ConflictException);
            expect(fetchMock).toHaveBeenCalledTimes(1);

            jest.advanceTimersByTime(UpgradeService.LOCK_MS - 1);
            await expect(service.trigger("user-1")).rejects.toBeInstanceOf(ConflictException);
            expect(fetchMock).toHaveBeenCalledTimes(1);

            jest.advanceTimersByTime(2);
            await expect(service.trigger("user-1")).resolves.toEqual({ targetVersion: "0.6.0" });
            expect(fetchMock).toHaveBeenCalledTimes(2);
        });

        it("rejects a concurrent second call while the first is still pending", async () => {
            configured();
            let resolveFetch!: (value: Response) => void;
            fetchMock.mockImplementationOnce(
                () =>
                    new Promise<Response>((resolve) => {
                        resolveFetch = resolve;
                    }),
            );
            const service = build();

            const first = service.trigger("user-1");
            await expect(service.trigger("user-2")).rejects.toBeInstanceOf(ConflictException);
            expect(fetchMock).toHaveBeenCalledTimes(1);

            resolveFetch(response(200));
            await expect(first).resolves.toEqual({ targetVersion: "0.6.0" });
        });

        it("releases the lock after a failure so the next call calls fetch again", async () => {
            configured();
            fetchMock.mockResolvedValueOnce(response(500));
            const service = build();

            await expect(service.trigger("user-1")).rejects.toBeInstanceOf(BadGatewayException);
            await expect(service.trigger("user-1")).resolves.toEqual({ targetVersion: "0.6.0" });
            expect(fetchMock).toHaveBeenCalledTimes(2);
        });
    });
});
