import { fromBase64Url } from "../base64url";

export type PushDeviceState = "unsupported" | "ios-install" | "denied" | "off" | "on";

export interface PushEnvironment {
    hasServiceWorker: boolean;
    hasPushManager: boolean;
    hasNotification: boolean;
    isIos: boolean;
    isStandalone: boolean;
}

// iPadOS 13+ requests the desktop site by default, so its UA claims Macintosh; touch points tell it apart.
export function isIosDevice(ua: string, maxTouchPoints: number): boolean {
    if (/iPhone|iPad|iPod/.test(ua)) return true;
    return /Macintosh/.test(ua) && maxTouchPoints > 1;
}

// iOS only grants push to a home-screen web app, which reports standalone display mode.
export function isStandaloneDisplay(matchStandalone: boolean, navigatorStandalone: boolean | undefined): boolean {
    return matchStandalone || navigatorStandalone === true;
}

export function resolvePushDeviceState(
    env: PushEnvironment,
    permission: NotificationPermission | null,
    subscribed: boolean,
): PushDeviceState {
    if (env.isIos && !env.isStandalone) return "ios-install";
    if (!env.hasServiceWorker || !env.hasPushManager || !env.hasNotification) return "unsupported";
    if (permission === "denied") return "denied";
    if (subscribed && permission === "granted") return "on";
    return "off";
}

export function subscriptionUsesKey(applicationServerKey: ArrayBuffer | null, publicKeyB64url: string): boolean {
    if (!applicationServerKey) return false;
    const current = new Uint8Array(applicationServerKey);
    const expected = fromBase64Url(publicKeyB64url);
    if (current.length !== expected.length) return false;
    for (let i = 0; i < current.length; i++) {
        if (current[i] !== expected[i]) return false;
    }
    return true;
}
