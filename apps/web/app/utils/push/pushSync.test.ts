import { describe, expect, it, vi } from "vitest";
import { toBase64Url } from "../base64url";
import {
    syncPushSubscription,
    unregisterThisBrowser,
    type PushRegistrationLike,
    type PushSubscriptionLike,
    type PushSyncDeps,
} from "./pushSync";

const ENDPOINT = "https://push.example/abc";
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

function syncDeps(overrides: Partial<PushSyncDeps> & { registration?: PushRegistrationLike } = {}) {
    const register = vi.fn<PushSyncDeps["register"]>(() => Promise.resolve({}));
    const deps: PushSyncDeps = {
        permission: "granted",
        getRegistration: vi.fn(() => Promise.resolve(overrides.registration)),
        fetchVapidKey: vi.fn(() => Promise.resolve(NEW_KEY)),
        register,
        device: DEVICE,
        ...overrides,
    };
    return { deps, register };
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

    it("does nothing without a subscription", async () => {
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

        await unregisterThisBrowser({ getRegistration: () => Promise.resolve(registration), unregister });

        expect(unregister).toHaveBeenCalledWith(ENDPOINT);
        expect(order).toEqual(["api", "unsubscribe"]);
    });

    it("still unsubscribes and swallows the error when the API rejects", async () => {
        const subscription = fakeSubscription(null);
        const { registration } = fakeRegistration(subscription);
        const unregister = vi.fn(() => Promise.reject(new Error("offline")));

        await expect(
            unregisterThisBrowser({ getRegistration: () => Promise.resolve(registration), unregister }),
        ).resolves.toBeUndefined();
        expect(subscription.unsubscribe).toHaveBeenCalledTimes(1);
    });

    it("does nothing without a registration or subscription", async () => {
        const unregister = vi.fn(() => Promise.resolve());
        await unregisterThisBrowser({ getRegistration: () => Promise.resolve(undefined), unregister });
        const { registration } = fakeRegistration(null);
        await unregisterThisBrowser({ getRegistration: () => Promise.resolve(registration), unregister });
        expect(unregister).not.toHaveBeenCalled();
    });

    it("resolves within the timeout even when the API hangs", async () => {
        const subscription = fakeSubscription(null);
        const { registration } = fakeRegistration(subscription);
        const unregister = vi.fn(() => new Promise<void>(() => undefined));

        const started = Date.now();
        await unregisterThisBrowser({ getRegistration: () => Promise.resolve(registration), unregister }, 20);

        expect(Date.now() - started).toBeLessThan(1000);
    });
});
