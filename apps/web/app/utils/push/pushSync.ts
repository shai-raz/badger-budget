import type { IPushSubscription, IRegisterPushSubscriptionRequest } from "@badger/types";
import { fromBase64Url } from "../base64url";
import { describeDevice } from "../deviceLabel";
import { subscriptionUsesKey } from "./pushState";
import type { PushIdStore } from "./pushSubscriptionIdStore";

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
    register(data: IRegisterPushSubscriptionRequest): Promise<IPushSubscription>;
    device: DeviceInfo;
    idStore: PushIdStore;
}

export interface PushUnregisterDeps {
    getRegistration(): Promise<PushRegistrationLike | undefined>;
    unregister(endpoint: string): Promise<void>;
    idStore: PushIdStore;
}

export interface EnablePushDeps {
    registration: PushRegistrationLike;
    publicKey: string;
    register(data: IRegisterPushSubscriptionRequest): Promise<IPushSubscription>;
    device: DeviceInfo;
    idStore: PushIdStore;
}

function statusOf(error: unknown): number | undefined {
    return (error as { response?: { status?: number } } | null)?.response?.status;
}

/**
 * A register answered 410: the user removed this endpoint, or the row it replaces, from their devices, and it must
 * not be re-added.
 */
export function isRemovedRegistration(error: unknown): boolean {
    return statusOf(error) === 410;
}

/** A register answered 409: the push service reported this endpoint dead, so the browser needs a new one. */
function isDeadEndpoint(error: unknown): boolean {
    return statusOf(error) === 409;
}

/** Always a new endpoint from the push service, so a removed one is never reused. */
function subscribeFresh(registration: PushRegistrationLike, publicKey: string): Promise<PushSubscriptionLike> {
    return registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: new Uint8Array(fromBase64Url(publicKey)),
    });
}

/** Returns this browser's subscription for the key, replacing one made with a different key. */
export async function ensureSubscription(
    registration: PushRegistrationLike,
    publicKey: string,
): Promise<PushSubscriptionLike> {
    const existing = await registration.pushManager.getSubscription();
    if (existing && subscriptionUsesKey(existing.options.applicationServerKey, publicKey)) return existing;
    if (existing) await existing.unsubscribe();
    return subscribeFresh(registration, publicKey);
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

/**
 * Registers `subscription` in place of the row this browser registered before (`replacesId`). A dead endpoint is
 * swapped once for a new one from the push service.
 */
async function registerReplacing(
    registration: PushRegistrationLike,
    publicKey: string,
    subscription: PushSubscriptionLike,
    replacesId: string | null,
    deps: Pick<PushSyncDeps, "register" | "device">,
): Promise<IPushSubscription> {
    const request = (sub: PushSubscriptionLike): IRegisterPushSubscriptionRequest => ({
        ...buildRegisterRequest(sub, deps.device),
        ...(replacesId ? { replacesId } : {}),
    });
    try {
        return await deps.register(request(subscription));
    } catch (error) {
        if (!isDeadEndpoint(error)) throw error;
    }
    await subscription.unsubscribe();
    return deps.register(request(await subscribeFresh(registration, publicKey)));
}

/** Unsubscribes whatever subscription this browser holds now (the one that was refused). */
async function unsubscribeCurrent(registration: PushRegistrationLike): Promise<void> {
    await (await registration.pushManager.getSubscription())?.unsubscribe();
}

/**
 * Re-registers this browser's subscription on app start (re-keying it if the VAPID key changed), in place of the row
 * it registered before. When the browser dropped its subscription but registered one before, it subscribes again, so
 * a device whose endpoint died comes back by itself. Silent with neither: notifications are off here.
 * A removed device is turned off in this browser instead of being re-added: the page then shows "Off".
 */
export async function syncPushSubscription(deps: PushSyncDeps): Promise<void> {
    if (deps.permission !== "granted") return;
    const registration = await deps.getRegistration();
    if (!registration) return;
    const storedId = deps.idStore.load();
    const existing = await registration.pushManager.getSubscription();
    if (!existing && !storedId) return;

    const publicKey = await deps.fetchVapidKey();
    const subscription = existing
        ? await ensureSubscription(registration, publicKey)
        : await subscribeFresh(registration, publicKey);
    try {
        const registered = await registerReplacing(registration, publicKey, subscription, storedId, deps);
        deps.idStore.save(registered.id);
    } catch (error) {
        if (!isRemovedRegistration(error)) throw error;
        await unsubscribeCurrent(registration);
        deps.idStore.clear();
    }
}

/**
 * The deliberate Turn on. A removed endpoint or row (the browser still holds it) is dropped and replaced by a new
 * one, so an explicit enable never leaves the device stuck.
 */
export async function enablePushSubscription(deps: EnablePushDeps): Promise<string> {
    const subscription = await ensureSubscription(deps.registration, deps.publicKey);
    try {
        const registered = await registerReplacing(
            deps.registration,
            deps.publicKey,
            subscription,
            deps.idStore.load(),
            deps,
        );
        deps.idStore.save(registered.id);
        return registered.id;
    } catch (error) {
        if (!isRemovedRegistration(error)) throw error;
    }

    deps.idStore.clear();
    await unsubscribeCurrent(deps.registration);
    const fresh = await subscribeFresh(deps.registration, deps.publicKey);
    const registered = await deps.register(buildRegisterRequest(fresh, deps.device));
    deps.idStore.save(registered.id);
    return registered.id;
}

/** Best-effort removal of this browser's subscription on logout. Never rejects, and resolves within timeoutMs. */
export async function unregisterThisBrowser(deps: PushUnregisterDeps, timeoutMs = 3000): Promise<void> {
    deps.idStore.clear();
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
