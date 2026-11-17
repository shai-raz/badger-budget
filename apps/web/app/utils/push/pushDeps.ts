import type { ApiClient } from "@badger/api-client";
import { loadAutoSyncKey } from "./autoSyncKeyStore";
import { syncAutoSyncDevice } from "./autoSyncDevice";
import { syncPushSubscription, unregisterThisBrowser, type PushRegistrationLike } from "./pushSync";

// Never `navigator.serviceWorker.ready`: it never resolves when no worker is registered (e.g. in dev).
export async function getPushRegistration(): Promise<PushRegistrationLike | undefined> {
    if (!("serviceWorker" in navigator)) return undefined;
    return navigator.serviceWorker.getRegistration();
}

/**
 * Re-registers this browser's existing push subscription on app start, then points this device's auto-sync grant at
 * it, in case the browser replaced the subscription. Silent unless one already exists.
 */
export async function syncThisBrowserPush(apiClient: ApiClient): Promise<void> {
    await syncPushSubscription({
        permission: typeof Notification === "undefined" ? null : Notification.permission,
        getRegistration: getPushRegistration,
        fetchVapidKey: async () => (await apiClient.getVapidPublicKey()).publicKey,
        register: (data) => apiClient.registerPushSubscription(data),
        device: { userAgent: navigator.userAgent, maxTouchPoints: navigator.maxTouchPoints },
    });
    await syncAutoSyncDevice({
        getSubscription: async () => (await getPushRegistration())?.pushManager.getSubscription() ?? null,
        loadAutoSyncKey,
        move: (body) => apiClient.moveAutoSyncDevice(body),
    });
}

/** Removes this browser's push subscription on the server and in the browser. Bounded by a timeout; never rejects. */
export function unregisterThisBrowserPush(apiClient: ApiClient): Promise<void> {
    return unregisterThisBrowser({
        getRegistration: getPushRegistration,
        unregister: (endpoint) => apiClient.unregisterPushSubscription(endpoint),
    });
}
