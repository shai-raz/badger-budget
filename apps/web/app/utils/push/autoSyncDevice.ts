import type { IMoveAutoSyncDevice } from "@badger/types";
import type { AutoSyncKeyRecord } from "./autoSyncKeyStore";

// Keeps the auto-sync grant pointed at this browser's current push subscription. When the browser replaces its
// subscription, the server's next push to the old endpoint gets 410 and the grant is deleted with it, so the grant is
// moved as soon as this device sees the new one. Reached from the service worker too: no Vue, no api-client.

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

export interface SyncAutoSyncDeviceDeps {
    getSubscription(): Promise<DeviceSubscriptionLike | null>;
    loadAutoSyncKey(): Promise<AutoSyncKeyRecord | null>;
    move(body: IMoveAutoSyncDevice): Promise<void>;
}

/** On app start, after the push re-register: a no-op on the server when the grant already points here. */
export async function syncAutoSyncDevice(deps: SyncAutoSyncDeviceDeps): Promise<void> {
    const record = await deps.loadAutoSyncKey();
    if (!record) return;
    const subscription = await deps.getSubscription();
    if (!subscription) return;
    const body = buildMoveAutoSyncDevice(record, subscription);
    if (body) await deps.move(body);
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
 * the browser gave none) and moves the grant to it. Not every browser fires the event; app start covers the rest.
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
