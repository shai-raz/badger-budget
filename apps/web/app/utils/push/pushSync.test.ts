import { describe, expect, it, vi } from "vitest";
import type { IPushSubscription } from "@badger/types";
import { toBase64Url } from "../base64url";
import {
    enablePushSubscription,
    syncPushSubscription,
    unregisterThisBrowser,
    type EnablePushDeps,
    type PushRegistrationLike,
    type PushSubscriptionLike,
    type PushSyncDeps,
} from "./pushSync";
import type { PushIdStore } from "./pushSubscriptionIdStore";

const ENDPOINT = "https://push.example/abc";
const registered = (id: string): IPushSubscription => ({
    id,
    endpoint: ENDPOINT,
    deviceLabel: "Chrome on Windows",
    createdAt: "2026-11-12T00:00:00.000Z",
    lastSeenAt: "2026-11-12T00:00:00.000Z",
    lastAcceptedAt: null,
});
const NEW_KEY = toBase64Url(new Uint8Array([4, 9, 9, 9]));
const DEVICE = { userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0", maxTouchPoints: 0 };

function fakeSubscription(storedKey: Uint8Array<ArrayBuffer> | null, endpoint = ENDPOINT): PushSubscriptionLike {
    return {
        endpoint,
        options: { applicationServerKey: storedKey ? storedKey.buffer.slice(0) : null },
        toJSON: () => ({ keys: { p256dh: "p256", auth: "auth" } }),
        unsubscribe: vi.fn(() => Promise.resolve(true)),
    };
}

function fakeRegistration(existing: PushSubscriptionLike | null) {
    const created = fakeSubscription(new Uint8Array([4, 9, 9, 9]), "https://push.example/new");
    const registration = {
        pushManager: {
            getSubscription: vi.fn(() => Promise.resolve(existing)),
            subscribe: vi.fn(() => Promise.resolve(created)),
        },
    } satisfies PushRegistrationLike;
    return { registration, created };
}

/** An in-memory id store, starting with `initial`. */
function fakeIdStore(initial: string | null = null) {
    let value = initial;
    return {
        load: vi.fn(() => value),
        save: vi.fn((id: string) => {
            value = id;
        }),
        clear: vi.fn(() => {
            value = null;
        }),
    } satisfies PushIdStore;
}

function syncDeps(overrides: Partial<PushSyncDeps> & { registration?: PushRegistrationLike } = {}) {
    const register = vi.fn<PushSyncDeps["register"]>(() => Promise.resolve(registered("sub-1")));
    const idStore = fakeIdStore();
    const deps: PushSyncDeps = {
        permission: "granted",
        getRegistration: vi.fn(() => Promise.resolve(overrides.registration)),
        fetchVapidKey: vi.fn(() => Promise.resolve(NEW_KEY)),
        register,
        device: DEVICE,
        idStore,
        ...overrides,
    };
    return { deps, register, idStore: deps.idStore as ReturnType<typeof fakeIdStore> };
}

describe("syncPushSubscription", () => {
    it("does nothing without permission", async () => {
        const { registration } = fakeRegistration(fakeSubscription(new Uint8Array([4, 9, 9, 9])));
        const { deps, register } = syncDeps({ permission: "default", registration });
        await syncPushSubscription(deps);
        expect(deps.getRegistration).not.toHaveBeenCalled();
        expect(register).not.toHaveBeenCalled();
    });

    it("does nothing without a registration", async () => {
        const { deps, register } = syncDeps({ registration: undefined });
        await syncPushSubscription(deps);
        expect(deps.fetchVapidKey).not.toHaveBeenCalled();
        expect(register).not.toHaveBeenCalled();
    });

    it("does nothing without a subscription or an earlier registration", async () => {
        const { registration } = fakeRegistration(null);
        const { deps, register } = syncDeps({ registration });
        await syncPushSubscription(deps);
        expect(deps.fetchVapidKey).not.toHaveBeenCalled();
        expect(registration.pushManager.subscribe).not.toHaveBeenCalled();
        expect(register).not.toHaveBeenCalled();
    });

    it("re-subscribes with the new key when the stored key differs, then registers the new subscription", async () => {
        const old = fakeSubscription(new Uint8Array([4, 1, 1, 1]));
        const { registration, created } = fakeRegistration(old);
        const { deps, register } = syncDeps({ registration });

        await syncPushSubscription(deps);

        expect(old.unsubscribe).toHaveBeenCalledTimes(1);
        expect(registration.pushManager.subscribe).toHaveBeenCalledWith(
            expect.objectContaining({ userVisibleOnly: true }),
        );
        expect(register).toHaveBeenCalledWith({
            endpoint: created.endpoint,
            keys: { p256dh: "p256", auth: "auth" },
            deviceLabel: "Chrome on Windows",
        });
    });

    it("upserts the existing subscription without re-subscribing when the key matches", async () => {
        const existing = fakeSubscription(new Uint8Array([4, 9, 9, 9]));
        const { registration } = fakeRegistration(existing);
        const { deps, register } = syncDeps({ registration });

        await syncPushSubscription(deps);

        expect(existing.unsubscribe).not.toHaveBeenCalled();
        expect(registration.pushManager.subscribe).not.toHaveBeenCalled();
        expect(register).toHaveBeenCalledWith(expect.objectContaining({ endpoint: ENDPOINT }));
    });

    it("registers in place of the earlier row and keeps the id the server returns", async () => {
        const { registration } = fakeRegistration(fakeSubscription(new Uint8Array([4, 9, 9, 9])));
        const { deps, register, idStore } = syncDeps({ registration, idStore: fakeIdStore("sub-old") });
        register.mockResolvedValueOnce(registered("sub-old"));

        await syncPushSubscription(deps);

        expect(register).toHaveBeenCalledWith(expect.objectContaining({ endpoint: ENDPOINT, replacesId: "sub-old" }));
        expect(idStore.save).toHaveBeenCalledWith("sub-old");
    });

    it("subscribes again when the browser dropped its subscription but registered one before", async () => {
        const { registration, created } = fakeRegistration(null);
        const { deps, register } = syncDeps({ registration, idStore: fakeIdStore("sub-old") });

        await syncPushSubscription(deps);

        expect(registration.pushManager.subscribe).toHaveBeenCalledWith(
            expect.objectContaining({ userVisibleOnly: true }),
        );
        expect(register).toHaveBeenCalledWith(
            expect.objectContaining({ endpoint: created.endpoint, replacesId: "sub-old" }),
        );
    });

    it("swaps a dead endpoint (409) for a new one, still in place of the earlier row", async () => {
        const existing = fakeSubscription(new Uint8Array([4, 9, 9, 9]));
        const { registration, created } = fakeRegistration(existing);
        const { deps, register, idStore } = syncDeps({ registration, idStore: fakeIdStore("sub-old") });
        register.mockRejectedValueOnce(apiError(409)).mockResolvedValueOnce(registered("sub-old"));

        await syncPushSubscription(deps);

        expect(existing.unsubscribe).toHaveBeenCalledTimes(1);
        expect(register).toHaveBeenLastCalledWith(
            expect.objectContaining({ endpoint: created.endpoint, replacesId: "sub-old" }),
        );
        expect(idStore.save).toHaveBeenCalledWith("sub-old");
    });
});

describe("unregisterThisBrowser", () => {
    it("calls the API with the endpoint, then unsubscribes", async () => {
        const subscription = fakeSubscription(null);
        const { registration } = fakeRegistration(subscription);
        const order: string[] = [];
        const unregister = vi.fn(() => {
            order.push("api");
            return Promise.resolve();
        });
        vi.mocked(subscription.unsubscribe).mockImplementation(() => {
            order.push("unsubscribe");
            return Promise.resolve(true);
        });

        await unregisterThisBrowser({
            getRegistration: () => Promise.resolve(registration),
            unregister,
            idStore: fakeIdStore(),
        });

        expect(unregister).toHaveBeenCalledWith(ENDPOINT);
        expect(order).toEqual(["api", "unsubscribe"]);
    });

    it("still unsubscribes and swallows the error when the API rejects", async () => {
        const subscription = fakeSubscription(null);
        const { registration } = fakeRegistration(subscription);
        const unregister = vi.fn(() => Promise.reject(new Error("offline")));

        await expect(
            unregisterThisBrowser({
                getRegistration: () => Promise.resolve(registration),
                unregister,
                idStore: fakeIdStore(),
            }),
        ).resolves.toBeUndefined();
        expect(subscription.unsubscribe).toHaveBeenCalledTimes(1);
    });

    it("forgets the earlier registration, so app start does not bring the device back", async () => {
        const idStore = fakeIdStore("sub-1");
        const unregister = vi.fn(() => Promise.resolve());

        await unregisterThisBrowser({ getRegistration: () => Promise.resolve(undefined), unregister, idStore });

        expect(idStore.clear).toHaveBeenCalled();
    });

    it("does nothing without a registration or subscription", async () => {
        const unregister = vi.fn(() => Promise.resolve());
        await unregisterThisBrowser({
            getRegistration: () => Promise.resolve(undefined),
            unregister,
            idStore: fakeIdStore(),
        });
        const { registration } = fakeRegistration(null);
        await unregisterThisBrowser({
            getRegistration: () => Promise.resolve(registration),
            unregister,
            idStore: fakeIdStore(),
        });
        expect(unregister).not.toHaveBeenCalled();
    });

    it("resolves within the timeout even when the API hangs", async () => {
        const subscription = fakeSubscription(null);
        const { registration } = fakeRegistration(subscription);
        const unregister = vi.fn(() => new Promise<void>(() => undefined));

        const started = Date.now();
        await unregisterThisBrowser(
            { getRegistration: () => Promise.resolve(registration), unregister, idStore: fakeIdStore() },
            20,
        );

        expect(Date.now() - started).toBeLessThan(1000);
    });
});

// Shape of an Axios error from the API: the register endpoint answers 410 for an endpoint the user removed.
function apiError(status: number): Error {
    return Object.assign(new Error(`HTTP ${status}`), { response: { status } });
}

describe("syncPushSubscription with a removed endpoint", () => {
    it("unsubscribes this browser and forgets the earlier row instead of re-adding the endpoint", async () => {
        const existing = fakeSubscription(new Uint8Array([4, 9, 9, 9]));
        const { registration } = fakeRegistration(existing);
        const { deps, register, idStore } = syncDeps({ registration, idStore: fakeIdStore("sub-old") });
        register.mockRejectedValueOnce(apiError(410));

        await expect(syncPushSubscription(deps)).resolves.toBeUndefined();

        expect(existing.unsubscribe).toHaveBeenCalledTimes(1);
        expect(registration.pushManager.subscribe).not.toHaveBeenCalled();
        expect(idStore.clear).toHaveBeenCalled();
    });

    it("rethrows other register failures and keeps the subscription", async () => {
        const existing = fakeSubscription(new Uint8Array([4, 9, 9, 9]));
        const { registration } = fakeRegistration(existing);
        const { deps, register } = syncDeps({ registration });
        register.mockRejectedValueOnce(apiError(500));

        await expect(syncPushSubscription(deps)).rejects.toThrow("HTTP 500");
        expect(existing.unsubscribe).not.toHaveBeenCalled();
    });
});

describe("enablePushSubscription", () => {
    function enableDeps(
        registration: PushRegistrationLike,
        register: EnablePushDeps["register"],
        idStore = fakeIdStore(),
    ) {
        return { registration, publicKey: NEW_KEY, register, device: DEVICE, idStore };
    }

    it("registers the current subscription and resolves with the id the server assigned", async () => {
        const existing = fakeSubscription(new Uint8Array([4, 9, 9, 9]));
        const { registration } = fakeRegistration(existing);
        const register = vi.fn<EnablePushDeps["register"]>(() => Promise.resolve(registered("sub-1")));

        const id = await enablePushSubscription(enableDeps(registration, register));

        expect(id).toBe("sub-1");
        expect(registration.pushManager.subscribe).not.toHaveBeenCalled();
        expect(existing.unsubscribe).not.toHaveBeenCalled();
        expect(register).toHaveBeenCalledTimes(1);
        expect(register).toHaveBeenCalledWith(expect.objectContaining({ endpoint: ENDPOINT }));
    });

    it("drops a removed subscription and resolves with the id of the new registration", async () => {
        const existing = fakeSubscription(new Uint8Array([4, 9, 9, 9]));
        const { registration, created } = fakeRegistration(existing);
        const register = vi.fn<EnablePushDeps["register"]>();
        register.mockRejectedValueOnce(apiError(410)).mockResolvedValueOnce(registered("sub-2"));

        const id = await enablePushSubscription(enableDeps(registration, register));
        expect(id).toBe("sub-2");

        expect(existing.unsubscribe).toHaveBeenCalledTimes(1);
        expect(registration.pushManager.subscribe).toHaveBeenCalledWith(
            expect.objectContaining({ userVisibleOnly: true }),
        );
        expect(register).toHaveBeenCalledTimes(2);
        expect(register).toHaveBeenLastCalledWith(expect.objectContaining({ endpoint: created.endpoint }));
    });

    it("registers in place of the earlier row, then starts over plainly when that row was removed", async () => {
        const existing = fakeSubscription(new Uint8Array([4, 9, 9, 9]));
        const { registration, created } = fakeRegistration(existing);
        const idStore = fakeIdStore("sub-old");
        const register = vi.fn<EnablePushDeps["register"]>();
        register.mockRejectedValueOnce(apiError(410)).mockResolvedValueOnce(registered("sub-2"));

        await enablePushSubscription(enableDeps(registration, register, idStore));

        expect(register).toHaveBeenNthCalledWith(1, expect.objectContaining({ replacesId: "sub-old" }));
        expect(register.mock.calls[1]![0]).toEqual(expect.not.objectContaining({ replacesId: expect.anything() }));
        expect(register).toHaveBeenLastCalledWith(expect.objectContaining({ endpoint: created.endpoint }));
        expect(idStore.load()).toBe("sub-2");
    });

    it("rethrows other register failures without re-subscribing", async () => {
        const existing = fakeSubscription(new Uint8Array([4, 9, 9, 9]));
        const { registration } = fakeRegistration(existing);
        const register = vi.fn<EnablePushDeps["register"]>(() => Promise.reject(apiError(500)));

        await expect(enablePushSubscription(enableDeps(registration, register))).rejects.toThrow("HTTP 500");
        expect(existing.unsubscribe).not.toHaveBeenCalled();
        expect(registration.pushManager.subscribe).not.toHaveBeenCalled();
    });
});
