import { describe, expect, it } from "vitest";
import { describeDevice } from "./deviceLabel";

const SAFARI_IPHONE =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1";
const CHROME_IPHONE =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/124.0.6367.88 Mobile/15E148 Safari/604.1";
const SAFARI_IPAD =
    "Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1";
const SAFARI_IPADOS_DESKTOP_UA =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15";
const SAFARI_MAC = SAFARI_IPADOS_DESKTOP_UA;

describe("describeDevice", () => {
    it.each([
        [SAFARI_IPHONE, 5, "Safari on iPhone"],
        [CHROME_IPHONE, 5, "Chrome on iPhone"],
        [SAFARI_IPAD, 5, "Safari on iPad"],
        [SAFARI_IPADOS_DESKTOP_UA, 5, "Safari on iPad"],
        [SAFARI_MAC, 0, "Safari on Mac"],
        [
            "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36",
            5,
            "Chrome on Android",
        ],
        [
            "Mozilla/5.0 (Linux; Android 14; SAMSUNG SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/24.0 Chrome/117.0.0.0 Mobile Safari/537.36",
            5,
            "Samsung Internet on Android",
        ],
        [
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0",
            0,
            "Edge on Windows",
        ],
        [
            "Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            0,
            "Chrome on Chromebook",
        ],
        ["Mozilla/5.0 (X11; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0", 0, "Firefox on Linux"],
        ["", 0, "Unknown device"],
        ["curl/8.0", 0, "Unknown device"],
    ])("%s (touch points %i) -> %s", (ua, touchPoints, expected) => {
        expect(describeDevice(ua, touchPoints)).toBe(expected);
    });

    it("defaults maxTouchPoints to 0, so a Macintosh UA reads as Mac", () => {
        expect(describeDevice(SAFARI_MAC)).toBe("Safari on Mac");
    });

    it("never returns more than 100 characters", () => {
        const label = describeDevice(`${"x".repeat(500)} iPhone Chrome/124.0.0.0 Safari/537.36`);
        expect(label.length).toBeLessThanOrEqual(100);
        expect(label).toBe("Chrome on iPhone");
    });
});
