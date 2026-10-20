import { afterEach, describe, expect, it, vi } from "vitest";
import {
    hasRegisteredOnDevice,
    isOfferDismissed,
    markOfferDismissed,
    markRegisteredOnDevice,
} from "./syncPasskeyDeviceFlags";

afterEach(() => vi.unstubAllGlobals());

function memoryStorage() {
    const m = new Map<string, string>();
    return {
        getItem: (k: string) => m.get(k) ?? null,
        setItem: (k: string, v: string) => void m.set(k, v),
        m,
    };
}

describe("syncPasskeyDeviceFlags", () => {
    it("stores flags under per-user keys", () => {
        const s = memoryStorage();
        vi.stubGlobal("localStorage", s);
        expect(hasRegisteredOnDevice("u1")).toBe(false);
        markRegisteredOnDevice("u1");
        markOfferDismissed("u1");
        expect(s.m.get("badger:syncPasskey:registered:u1")).toBe("1");
        expect(s.m.get("badger:syncPasskey:offerDismissed:u1")).toBe("1");
        expect(hasRegisteredOnDevice("u1")).toBe(true);
        expect(isOfferDismissed("u1")).toBe(true);
    });

    it("isolates users and flags", () => {
        vi.stubGlobal("localStorage", memoryStorage());
        markRegisteredOnDevice("u1");
        expect(hasRegisteredOnDevice("u2")).toBe(false);
        expect(isOfferDismissed("u1")).toBe(false);
    });

    it("tolerates a throwing localStorage", () => {
        const boom = () => {
            throw new Error("denied");
        };
        vi.stubGlobal("localStorage", { getItem: boom, setItem: boom });
        expect(hasRegisteredOnDevice("u1")).toBe(false);
        expect(() => markOfferDismissed("u1")).not.toThrow();
    });

    it("tolerates missing localStorage", () => {
        vi.stubGlobal("localStorage", undefined);
        expect(isOfferDismissed("u1")).toBe(false);
        expect(() => markRegisteredOnDevice("u1")).not.toThrow();
    });
});
