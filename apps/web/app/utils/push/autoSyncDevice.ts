import type { IMoveAutoSyncDevice } from "@badger/types";
import type { AutoSyncKeyRecord } from "./autoSyncKeyStore";

// The service worker's half of keeping a device when the browser replaces its push subscription: the worker has no
// session, so it proves itself with the auto-sync device key. App start covers the rest (syncPushSubscription).
// Reached from the service worker: no Vue, no api-client.

/** Structural stand-in for PushSubscription, so this runs under node tests and in the worker. */
export interface DeviceSubscriptionLike {
    endpoint: string;
    options: { applicationServerKey: ArrayBuffer | null };
    toJSON(): { keys?: Record<string, string> };
}

export interface DevicePushManagerLike {
    getSubscription(): Promise<DeviceSubscriptionLike | null>;
    subscribe(options: { userVisibleOnly: true; applicationServerKey: BufferSource }): Promise<DeviceSubscriptionLike>;
}

/** The request body, or null when the subscription has no keys to push with. */
export function buildMoveAutoSyncDevice(
    record: AutoSyncKeyRecord,
    subscription: DeviceSubscriptionLike,
): IMoveAutoSyncDevice | null {
    const keys = subscription.toJSON().keys;
    if (!keys?.p256dh || !keys.auth) return null;
    return {
        grantId: record.grantId,
        key: record.key,
        endpoint: subscription.endpoint,
        keys: { p256dh: keys.p256dh, auth: keys.auth },
    };
}

export interface SubscriptionChangeLike {
    oldSubscription: DeviceSubscriptionLike | null;
    newSubscription: DeviceSubscriptionLike | null;
}

export interface SubscriptionChangeDeps {
    pushManager: DevicePushManagerLike;
    loadAutoSyncKey(): Promise<AutoSyncKeyRecord | null>;
    fetch: typeof fetch;
}

/**
 * The worker's `pushsubscriptionchange`: takes the new subscription (subscribing again with the old one's key when
 * the browser gave none) and gives it to the grant's device. Not every browser fires the event; app start covers the
 * rest.
 */
export async function handleSubscriptionChange(
    event: SubscriptionChangeLike,
    deps: SubscriptionChangeDeps,
): Promise<void> {
    let subscription = event.newSubscription ?? (await deps.pushManager.getSubscription());
    if (!subscription) {
        const applicationServerKey = event.oldSubscription?.options.applicationServerKey;
        if (!applicationServerKey) return;
        subscription = await deps.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey });
    }

    const record = await deps.loadAutoSyncKey();
    if (!record) return;
    const body = buildMoveAutoSyncDevice(record, subscription);
    if (!body) return;
    await deps.fetch(`${record.apiBaseUrl}/bank-sync/auto-sync/device`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "omit",
        body: JSON.stringify(body),
    });
}
