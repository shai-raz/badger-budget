import type { IRegisterPushSubscriptionRequest } from "@badger/types";
import { fromBase64Url } from "../base64url";
import { describeDevice } from "../deviceLabel";
import { subscriptionUsesKey } from "./pushState";

// Structural stand-ins for the Push API so the logic runs under node tests with fakes.
export interface PushSubscriptionLike {
    endpoint: string;
    options: { applicationServerKey: ArrayBuffer | null };
    toJSON(): { keys?: Record<string, string> };
    unsubscribe(): Promise<boolean>;
}

export interface PushRegistrationLike {
    pushManager: {
        getSubscription(): Promise<PushSubscriptionLike | null>;
        subscribe(options: {
            userVisibleOnly: true;
            applicationServerKey: BufferSource;
        }): Promise<PushSubscriptionLike>;
    };
}

export interface DeviceInfo {
    userAgent: string;
    maxTouchPoints: number;
}

export interface PushSyncDeps {
    permission: NotificationPermission | null;
    getRegistration(): Promise<PushRegistrationLike | undefined>;
    fetchVapidKey(): Promise<string>;
    register(data: IRegisterPushSubscriptionRequest): Promise<unknown>;
    device: DeviceInfo;
}

export interface PushUnregisterDeps {
    getRegistration(): Promise<PushRegistrationLike | undefined>;
    unregister(endpoint: string): Promise<void>;
}

/** Returns this browser's subscription for the key, replacing one made with a different key. */
export async function ensureSubscription(
    registration: PushRegistrationLike,
    publicKey: string,
): Promise<PushSubscriptionLike> {
    const existing = await registration.pushManager.getSubscription();
    if (existing && subscriptionUsesKey(existing.options.applicationServerKey, publicKey)) return existing;
    if (existing) await existing.unsubscribe();
    return registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: new Uint8Array(fromBase64Url(publicKey)),
    });
}

export function buildRegisterRequest(
    subscription: PushSubscriptionLike,
    device: DeviceInfo,
): IRegisterPushSubscriptionRequest {
    const keys = subscription.toJSON().keys;
    if (!keys?.p256dh || !keys.auth) throw new Error("Push subscription is missing its keys");
    return {
        endpoint: subscription.endpoint,
        keys: { p256dh: keys.p256dh, auth: keys.auth },
        deviceLabel: describeDevice(device.userAgent, device.maxTouchPoints),
    };
}

/** Re-registers an existing subscription (re-keying it if the VAPID key changed). Silent when there is nothing to sync. */
export async function syncPushSubscription(deps: PushSyncDeps): Promise<void> {
    if (deps.permission !== "granted") return;
    const registration = await deps.getRegistration();
    if (!registration) return;
    const existing = await registration.pushManager.getSubscription();
    if (!existing) return;

    const publicKey = await deps.fetchVapidKey();
    const subscription = await ensureSubscription(registration, publicKey);
    await deps.register(buildRegisterRequest(subscription, deps.device));
}

/** Best-effort removal of this browser's subscription on logout. Never rejects, and resolves within timeoutMs. */
export async function unregisterThisBrowser(deps: PushUnregisterDeps, timeoutMs = 3000): Promise<void> {
    const work = (async () => {
        const registration = await deps.getRegistration();
        const subscription = await registration?.pushManager.getSubscription();
        if (!subscription) return;
        try {
            await deps.unregister(subscription.endpoint);
        } catch {
            // Unsubscribe anyway: the browser must stop receiving pushes for the signed-out user.
        }
        await subscription.unsubscribe();
    })().catch(() => undefined);

    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<void>((resolve) => {
        timer = setTimeout(resolve, timeoutMs);
    });
    try {
        await Promise.race([work, timeout]);
    } finally {
        clearTimeout(timer);
    }
}
