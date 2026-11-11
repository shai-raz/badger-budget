import type { ApiClient } from "@badger/api-client";
import { syncPushSubscription, unregisterThisBrowser, type PushRegistrationLike } from "./pushSync";

// Never `navigator.serviceWorker.ready`: it never resolves when no worker is registered (e.g. in dev).
export async function getPushRegistration(): Promise<PushRegistrationLike | undefined> {
    if (!("serviceWorker" in navigator)) return undefined;
    return navigator.serviceWorker.getRegistration();
}

/** Re-registers this browser's existing push subscription on app start. Silent unless one already exists. */
export function syncThisBrowserPush(apiClient: ApiClient): Promise<void> {
    return syncPushSubscription({
        permission: typeof Notification === "undefined" ? null : Notification.permission,
        getRegistration: getPushRegistration,
        fetchVapidKey: async () => (await apiClient.getVapidPublicKey()).publicKey,
        register: (data) => apiClient.registerPushSubscription(data),
        device: { userAgent: navigator.userAgent, maxTouchPoints: navigator.maxTouchPoints },
    });
}

/** Removes this browser's push subscription on the server and in the browser. Bounded by a timeout; never rejects. */
export function unregisterThisBrowserPush(apiClient: ApiClient): Promise<void> {
    return unregisterThisBrowser({
        getRegistration: getPushRegistration,
        unregister: (endpoint) => apiClient.unregisterPushSubscription(endpoint),
    });
}
