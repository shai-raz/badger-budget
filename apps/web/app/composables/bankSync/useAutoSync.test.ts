import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IAutoSyncStatus } from "@badger/types";
import { AutoSyncError, useAutoSync } from "./useAutoSync";

const { api, pushDevice, keyStore } = vi.hoisted(() => ({
    api: {
        getAutoSync: vi.fn(),
        enableAutoSync: vi.fn(),
        updateAutoSyncSchedule: vi.fn(),
        disableAutoSync: vi.fn(),
    },
    pushDevice: { enable: vi.fn(), state: { value: "off" as string } },
    keyStore: { save: vi.fn(), load: vi.fn(), clear: vi.fn() },
}));

vi.mock("../useApiClient", () => ({ useApiClient: () => api }));
vi.mock("../notifications/usePushDevice", () => ({ usePushDevice: () => pushDevice }));
vi.mock("../../utils/push/autoSyncKeyStore", () => ({
    saveAutoSyncKey: (...args: unknown[]) => keyStore.save(...args),
    loadAutoSyncKey: (...args: unknown[]) => keyStore.load(...args),
    clearAutoSyncKey: (...args: unknown[]) => keyStore.clear(...args),
}));

const HOURS_STATUS: IAutoSyncStatus = {
    id: "grant-1",
    intervalUnit: "hours",
    intervalCount: 4,
    windowStartMinute: 420,
    windowEndMinute: 1320,
    runAtMinute: null,
    timeZone: "America/New_York",
    deviceLabel: "Chrome on Windows",
    durationDays: 30,
    expiresAt: "2026-12-12T00:00:00.000Z",
    nextRunAt: "2026-11-12T12:00:00.000Z",
    lastRunAt: null,
    missedRuns: 0,
    unreachable: false,
    createdAt: "2026-11-12T00:00:00.000Z",
    includedConnections: [],
    notIncludedConnections: [],
};

const DAYS_STATUS: IAutoSyncStatus = {
    ...HOURS_STATUS,
    id: "grant-2",
    intervalUnit: "days",
    intervalCount: 3,
    windowStartMinute: null,
    windowEndMinute: null,
    runAtMinute: 540,
    durationDays: 90,
};

const HOURS_SCHEDULE = {
    intervalUnit: "hours",
    intervalCount: 4,
    windowStartMinute: 420,
    windowEndMinute: 1320,
} as const;
const DAYS_SCHEDULE = { intervalUnit: "days", intervalCount: 3, runAtMinute: 540 } as const;

beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 Chrome/120.0 (Windows NT 10.0)", maxTouchPoints: 0 });
    vi.stubGlobal("useRuntimeConfig", () => ({ public: { apiBaseUrl: "https://api.test/api/v1" } }));
    pushDevice.enable.mockResolvedValue("sub-1");
    pushDevice.state.value = "on";
    api.enableAutoSync.mockImplementation((body: { intervalUnit: string }) =>
        Promise.resolve(body.intervalUnit === "hours" ? HOURS_STATUS : DAYS_STATUS),
    );
    api.updateAutoSyncSchedule.mockResolvedValue(HOURS_STATUS);
    api.disableAutoSync.mockResolvedValue(undefined);
    keyStore.save.mockResolvedValue(undefined);
    keyStore.clear.mockResolvedValue(undefined);
    keyStore.load.mockResolvedValue(null);
});

describe("useAutoSync.enable", () => {
    it("uses a push subscription id taken earlier in the tap without asking for push again", async () => {
        const autoSync = useAutoSync();
        const pushSubscriptionId = await autoSync.ensurePushSubscriptionId();
        pushDevice.enable.mockClear();

        await autoSync.enable({
            pin: "1234",
            schedule: { ...HOURS_SCHEDULE },
            durationDays: 30,
            pushSubscriptionId,
        });

        expect(pushDevice.enable).not.toHaveBeenCalled();
        expect(api.enableAutoSync.mock.calls[0]?.[0]).toMatchObject({ pushSubscriptionId: "sub-1" });
    });

    it("sends the hours window and omits the run time", async () => {
        const autoSync = useAutoSync();

        await autoSync.enable({ pin: "1234", schedule: { ...HOURS_SCHEDULE }, durationDays: 30 });

        const body = api.enableAutoSync.mock.calls[0]?.[0];
        expect(body).toEqual({
            intervalUnit: "hours",
            intervalCount: 4,
            windowStartMinute: 420,
            windowEndMinute: 1320,
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            pin: "1234",
            key: expect.any(String),
            deviceLabel: "Chrome on Windows",
            pushSubscriptionId: "sub-1",
            durationDays: 30,
        });
        expect(body).not.toHaveProperty("runAtMinute");
    });

    it("sends the run time and omits the window for a daily schedule", async () => {
        const autoSync = useAutoSync();

        await autoSync.enable({ pin: "1234", schedule: { ...DAYS_SCHEDULE }, durationDays: 90 });

        const body = api.enableAutoSync.mock.calls[0]?.[0];
        expect(body).toMatchObject({ intervalUnit: "days", intervalCount: 3, runAtMinute: 540, durationDays: 90 });
        expect(body).not.toHaveProperty("windowStartMinute");
        expect(body).not.toHaveProperty("windowEndMinute");
    });

    it("stores a 32-byte device key under the granted id only after the API accepted it", async () => {
        const autoSync = useAutoSync();

        await autoSync.enable({ pin: "1234", schedule: { ...HOURS_SCHEDULE }, durationDays: 30 });

        const sentKey: string = api.enableAutoSync.mock.calls[0]?.[0].key;
        expect(sentKey).toHaveLength(43);
        expect(keyStore.save).toHaveBeenCalledWith({
            grantId: "grant-1",
            key: sentKey,
            apiBaseUrl: "https://api.test/api/v1",
        });
        expect(api.enableAutoSync.mock.invocationCallOrder[0] ?? 0).toBeLessThan(
            keyStore.save.mock.invocationCallOrder[0] ?? 0,
        );
        expect(autoSync.status.value).toEqual(HOURS_STATUS);
        expect(autoSync.holdsGrant.value).toBe(true);
    });

    it("stores nothing when the API call fails", async () => {
        api.enableAutoSync.mockRejectedValueOnce(new Error("wrong PIN"));
        const autoSync = useAutoSync();

        await expect(
            autoSync.enable({ pin: "0000", schedule: { ...HOURS_SCHEDULE }, durationDays: 30 }),
        ).rejects.toThrow("wrong PIN");

        expect(keyStore.save).not.toHaveBeenCalled();
        expect(autoSync.status.value).toBeNull();
        expect(autoSync.holdsGrant.value).toBe(false);
    });

    it("throws a typed denied error and makes no API call when push permission is refused", async () => {
        pushDevice.enable.mockResolvedValueOnce(null);
        pushDevice.state.value = "denied";
        const autoSync = useAutoSync();

        const attempt = autoSync.enable({ pin: "1234", schedule: { ...HOURS_SCHEDULE }, durationDays: 30 });

        await expect(attempt).rejects.toBeInstanceOf(AutoSyncError);
        await expect(attempt).rejects.toMatchObject({ reason: "push-denied" });
        expect(api.enableAutoSync).not.toHaveBeenCalled();
        expect(keyStore.save).not.toHaveBeenCalled();
    });

    it("throws a typed unavailable error when this device cannot get a push subscription", async () => {
        pushDevice.enable.mockResolvedValueOnce(null);
        pushDevice.state.value = "unsupported";
        const autoSync = useAutoSync();

        await expect(
            autoSync.enable({ pin: "1234", schedule: { ...HOURS_SCHEDULE }, durationDays: 30 }),
        ).rejects.toMatchObject({
            reason: "push-unavailable",
        });
        expect(api.enableAutoSync).not.toHaveBeenCalled();
    });
});

describe("useAutoSync.refresh and holdsGrant", () => {
    it("holds the grant when the stored key belongs to the current status", async () => {
        api.getAutoSync.mockResolvedValueOnce({ autoSync: HOURS_STATUS });
        keyStore.load.mockResolvedValueOnce({ grantId: "grant-1", key: "k", apiBaseUrl: "/api/v1" });
        const autoSync = useAutoSync();

        await autoSync.refresh();

        expect(autoSync.status.value).toEqual(HOURS_STATUS);
        expect(autoSync.holdsGrant.value).toBe(true);
        expect(autoSync.loading.value).toBe(false);
    });

    it("does not hold the grant when the stored key belongs to another grant", async () => {
        api.getAutoSync.mockResolvedValueOnce({ autoSync: HOURS_STATUS });
        keyStore.load.mockResolvedValueOnce({ grantId: "older", key: "k", apiBaseUrl: "/api/v1" });
        const autoSync = useAutoSync();

        await autoSync.refresh();

        expect(autoSync.holdsGrant.value).toBe(false);
    });

    it("reloads quietly without raising the loading flag", async () => {
        api.getAutoSync.mockResolvedValueOnce({ autoSync: HOURS_STATUS });
        const autoSync = useAutoSync();

        const pending = autoSync.refresh({ quiet: true });
        expect(autoSync.loading.value).toBe(false);
        await pending;

        expect(autoSync.status.value).toEqual(HOURS_STATUS);
        expect(autoSync.loading.value).toBe(false);
    });

    it("does not hold a grant when auto-sync is off", async () => {
        api.getAutoSync.mockResolvedValueOnce({ autoSync: null });
        keyStore.load.mockResolvedValueOnce({ grantId: "grant-1", key: "k", apiBaseUrl: "/api/v1" });
        const autoSync = useAutoSync();

        await autoSync.refresh();

        expect(autoSync.status.value).toBeNull();
        expect(autoSync.holdsGrant.value).toBe(false);
    });
});

describe("useAutoSync.updateSchedule", () => {
    it("sends the new schedule with the browser time zone and keeps the returned status", async () => {
        const autoSync = useAutoSync();

        await autoSync.updateSchedule({ ...DAYS_SCHEDULE });

        expect(api.updateAutoSyncSchedule).toHaveBeenCalledWith({
            intervalUnit: "days",
            intervalCount: 3,
            runAtMinute: 540,
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        });
        expect(autoSync.status.value).toEqual(HOURS_STATUS);
    });
});

describe("useAutoSync.disable", () => {
    it("turns auto-sync off on the API and clears the device key", async () => {
        api.getAutoSync.mockResolvedValueOnce({ autoSync: HOURS_STATUS });
        keyStore.load.mockResolvedValueOnce({ grantId: "grant-1", key: "k", apiBaseUrl: "/api/v1" });
        const autoSync = useAutoSync();
        await autoSync.refresh();
        expect(autoSync.holdsGrant.value).toBe(true);

        await autoSync.disable();

        expect(api.disableAutoSync).toHaveBeenCalledTimes(1);
        expect(keyStore.clear).toHaveBeenCalledTimes(1);
        expect(autoSync.status.value).toBeNull();
        expect(autoSync.holdsGrant.value).toBe(false);
    });

    it("keeps the device key when the API call fails", async () => {
        api.disableAutoSync.mockRejectedValueOnce(new Error("offline"));
        const autoSync = useAutoSync();

        await expect(autoSync.disable()).rejects.toThrow("offline");
        expect(keyStore.clear).not.toHaveBeenCalled();
    });
});

describe("useAutoSync.renew", () => {
    it("re-enables with the current hours schedule and duration", async () => {
        api.getAutoSync.mockResolvedValueOnce({ autoSync: HOURS_STATUS });
        const autoSync = useAutoSync();
        await autoSync.refresh();

        await autoSync.renew("1234");

        expect(api.enableAutoSync).toHaveBeenCalledWith(
            expect.objectContaining({
                intervalUnit: "hours",
                intervalCount: 4,
                windowStartMinute: 420,
                windowEndMinute: 1320,
                durationDays: 30,
                pin: "1234",
            }),
        );
    });

    it("re-enables with the current daily schedule and duration", async () => {
        api.getAutoSync.mockResolvedValueOnce({ autoSync: DAYS_STATUS });
        const autoSync = useAutoSync();
        await autoSync.refresh();

        await autoSync.renew("1234");

        const body = api.enableAutoSync.mock.calls[0]?.[0];
        expect(body).toMatchObject({ intervalUnit: "days", intervalCount: 3, runAtMinute: 540, durationDays: 90 });
        expect(body).not.toHaveProperty("windowStartMinute");
    });

    it("refuses to renew when auto-sync is not on", async () => {
        const autoSync = useAutoSync();

        await expect(autoSync.renew("1234")).rejects.toThrow("Auto-sync is not on");
        expect(api.enableAutoSync).not.toHaveBeenCalled();
    });
});
