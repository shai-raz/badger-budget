import { beforeEach, describe, expect, it, vi } from "vitest";
import { useApiClient } from "./useApiClient";

const { keyStore, captured } = vi.hoisted(() => ({
    keyStore: { clear: vi.fn() },
    captured: { config: null as { clearTokens?: () => Promise<void> } | null },
}));

vi.mock("@badger/api-client", () => ({
    ApiClient: vi.fn(function (config: { clearTokens?: () => Promise<void> }) {
        captured.config = config;
    }),
}));
vi.mock("~/utils/push/autoSyncKeyStore", () => ({
    clearAutoSyncKey: (...args: unknown[]) => keyStore.clear(...args),
}));

describe("useApiClient forced sign-out", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        keyStore.clear.mockResolvedValue(undefined);
        vi.stubGlobal("useRuntimeConfig", () => ({ public: { apiBaseUrl: "https://api.test/api/v1" } }));
        vi.stubGlobal("useRouter", () => ({ currentRoute: { value: { path: "/", fullPath: "/" } }, push: vi.fn() }));
    });

    it("drops the device auto-sync key when the refresh token is rejected", async () => {
        useApiClient();

        await captured.config?.clearTokens?.();

        expect(keyStore.clear).toHaveBeenCalledTimes(1);
    });
});
