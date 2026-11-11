import { describe, expect, it } from "vitest";
import { toBase64Url } from "../base64url";
import {
    isIosDevice,
    isStandaloneDisplay,
    resolvePushDeviceState,
    subscriptionUsesKey,
    type PushEnvironment,
} from "./pushState";

const SUPPORTED: PushEnvironment = {
    hasServiceWorker: true,
    hasPushManager: true,
    hasNotification: true,
    isIos: false,
    isStandalone: false,
};

const IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15";
const IPADOS_DESKTOP_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15";
const MAC_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15";

describe("isIosDevice", () => {
    it("detects iPhone, iPad and iPod by user agent", () => {
        expect(isIosDevice(IPHONE_UA, 5)).toBe(true);
        expect(isIosDevice("Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X)", 0)).toBe(true);
        expect(isIosDevice("Mozilla/5.0 (iPod touch; CPU iPhone OS 15_0)", 0)).toBe(true);
    });

    it("detects iPadOS requesting the desktop site via touch points", () => {
        expect(isIosDevice(IPADOS_DESKTOP_UA, 5)).toBe(true);
    });

    it("does not treat a real Mac (no touch points) as iOS", () => {
        expect(isIosDevice(MAC_UA, 0)).toBe(false);
        expect(isIosDevice(MAC_UA, 1)).toBe(false);
    });

    it("does not treat Android or Windows as iOS", () => {
        expect(isIosDevice("Mozilla/5.0 (Linux; Android 14; Pixel 8)", 5)).toBe(false);
        expect(isIosDevice("Mozilla/5.0 (Windows NT 10.0; Win64; x64)", 10)).toBe(false);
    });
});

describe("isStandaloneDisplay", () => {
    it("is standalone when either the display-mode media query or navigator.standalone says so", () => {
        expect(isStandaloneDisplay(true, undefined)).toBe(true);
        expect(isStandaloneDisplay(false, true)).toBe(true);
        expect(isStandaloneDisplay(false, false)).toBe(false);
        expect(isStandaloneDisplay(false, undefined)).toBe(false);
    });
});

describe("resolvePushDeviceState", () => {
    it("asks iOS users to install the app to the home screen before anything else", () => {
        const env = { ...SUPPORTED, isIos: true, isStandalone: false, hasPushManager: false };
        expect(resolvePushDeviceState(env, "granted", true)).toBe("ios-install");
    });

    it("treats an installed iOS app as a normal device", () => {
        const env = { ...SUPPORTED, isIos: true, isStandalone: true };
        expect(resolvePushDeviceState(env, "granted", true)).toBe("on");
    });

    it.each([
        ["no service worker", { hasServiceWorker: false }],
        ["no push manager", { hasPushManager: false }],
        ["no Notification API", { hasNotification: false }],
    ])("is unsupported with %s", (_name, override) => {
        expect(resolvePushDeviceState({ ...SUPPORTED, ...override }, "granted", true)).toBe("unsupported");
    });

    it("is denied when the browser permission is denied", () => {
        expect(resolvePushDeviceState(SUPPORTED, "denied", false)).toBe("denied");
        expect(resolvePushDeviceState(SUPPORTED, "denied", true)).toBe("denied");
    });

    it("is on only with a subscription and a granted permission", () => {
        expect(resolvePushDeviceState(SUPPORTED, "granted", true)).toBe("on");
    });

    it("is off without a subscription or without a permission decision", () => {
        expect(resolvePushDeviceState(SUPPORTED, "granted", false)).toBe("off");
        expect(resolvePushDeviceState(SUPPORTED, "default", false)).toBe("off");
        expect(resolvePushDeviceState(SUPPORTED, "default", true)).toBe("off");
        expect(resolvePushDeviceState(SUPPORTED, null, false)).toBe("off");
    });
});

describe("subscriptionUsesKey", () => {
    const KEY = toBase64Url(new Uint8Array([4, 1, 2, 3, 250, 251, 252, 253]));

    it("matches a subscription created with the same key", () => {
        const stored = new Uint8Array([4, 1, 2, 3, 250, 251, 252, 253]).buffer;
        expect(subscriptionUsesKey(stored, KEY)).toBe(true);
    });

    it("does not match a subscription created with a different key of the same length", () => {
        const stored = new Uint8Array([4, 1, 2, 3, 250, 251, 252, 254]).buffer;
        expect(subscriptionUsesKey(stored, KEY)).toBe(false);
    });

    it("does not match a key of a different length", () => {
        const stored = new Uint8Array([4, 1, 2]).buffer;
        expect(subscriptionUsesKey(stored, KEY)).toBe(false);
    });

    it("does not match a subscription without an application server key", () => {
        expect(subscriptionUsesKey(null, KEY)).toBe(false);
    });
});
