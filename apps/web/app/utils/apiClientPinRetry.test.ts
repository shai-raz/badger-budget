import { describe, expect, it, vi, type Mock } from "vitest";
import { ApiClient } from "@badger/api-client";

interface FakeConfig {
    url?: string;
}

// Mimics an axios adapter: a 4xx/5xx reply rejects with an error carrying `response`, as axios does.
function respond(config: FakeConfig, status: number, data: unknown) {
    if (status >= 400) {
        throw Object.assign(new Error(`Request failed with status code ${status}`), {
            isAxiosError: true,
            config,
            response: { status, statusText: "", headers: {}, config, data },
        });
    }
    return { data, status, statusText: "OK", headers: {}, config, request: {} };
}

function createApi(adapter: Mock) {
    const api = new ApiClient({
        baseURL: "http://api.test",
        getAccessToken: () => Promise.resolve("access"),
        getRefreshToken: () => Promise.resolve("refresh"),
        setTokens: vi.fn(),
        clearTokens: vi.fn(),
        onAuthRequired: vi.fn(),
    });
    (api as unknown as { client: { defaults: { adapter: unknown } } }).client.defaults.adapter = adapter;
    return api;
}

describe("api client 401 handling for sync PIN", () => {
    it("rejects a wrong-PIN 401 without refreshing or retrying", async () => {
        const adapter = vi.fn(async (config: FakeConfig) => respond(config, 401, { message: "Invalid PIN" }));
        const api = createApi(adapter);

        await expect(api.triggerSync("9999")).rejects.toMatchObject({
            response: { status: 401, data: { message: "Invalid PIN" } },
        });
        expect(adapter).toHaveBeenCalledTimes(1);
        expect(adapter.mock.calls.some(([config]) => config.url?.includes("/auth/refresh"))).toBe(false);
    });

    it("still refreshes and retries an expired-session 401", async () => {
        let syncCalls = 0;
        const adapter = vi.fn(async (config: FakeConfig) => {
            if (config.url?.includes("/auth/refresh")) {
                return respond(config, 200, { accessToken: "new-access", refreshToken: "new-refresh" });
            }
            syncCalls += 1;
            return syncCalls === 1
                ? respond(config, 401, { message: "Unauthorized" })
                : respond(config, 200, { jobId: "j1" });
        });
        const api = createApi(adapter);

        await expect(api.triggerSync("1234")).resolves.toEqual({ jobId: "j1" });
        expect(adapter.mock.calls.map(([config]) => config.url)).toEqual([
            "/bank-sync/sync",
            "/auth/refresh",
            "/bank-sync/sync",
        ]);
    });
});
