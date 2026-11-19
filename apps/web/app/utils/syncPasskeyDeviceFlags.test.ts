import { afterEach, describe, expect, it, vi } from "vitest";
import {
    clearDeviceCredentialId,
    getDeviceCredentialId,
    hasRegisteredOnDevice,
    isOfferDismissed,
    markOfferDismissed,
    markRegisteredOnDevice,
    setDeviceCredentialId,
} from "./syncPasskeyDeviceFlags";

afterEach(() => vi.unstubAllGlobals());

function memoryStorage() {
    const m = new Map<string, string>();
    return {
        getItem: (k: string) => m.get(k) ?? null,
        setItem: (k: string, v: string) => void m.set(k, v),
        removeItem: (k: string) => void m.delete(k),
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
        vi.stubGlobal("localStorage", { getItem: boom, setItem: boom, removeItem: boom });
        expect(hasRegisteredOnDevice("u1")).toBe(false);
        expect(() => markOfferDismissed("u1")).not.toThrow();
        expect(getDeviceCredentialId("u1")).toBeNull();
        expect(() => setDeviceCredentialId("u1", "cred")).not.toThrow();
        expect(() => clearDeviceCredentialId("u1")).not.toThrow();
    });

    it("tolerates missing localStorage", () => {
        vi.stubGlobal("localStorage", undefined);
        expect(isOfferDismissed("u1")).toBe(false);
        expect(() => markRegisteredOnDevice("u1")).not.toThrow();
        expect(getDeviceCredentialId("u1")).toBeNull();
    });

    it("round-trips the device credential id per user", () => {
        const s = memoryStorage();
        vi.stubGlobal("localStorage", s);
        expect(getDeviceCredentialId("u1")).toBeNull();
        setDeviceCredentialId("u1", "cred-a");
        setDeviceCredentialId("u2", "cred-b");
        expect(s.m.get("badger:syncPasskey:credential:u1")).toBe("cred-a");
        expect(getDeviceCredentialId("u1")).toBe("cred-a");
        expect(getDeviceCredentialId("u2")).toBe("cred-b");
    });

    it("clears only the given user's device credential id", () => {
        vi.stubGlobal("localStorage", memoryStorage());
        setDeviceCredentialId("u1", "cred-a");
        setDeviceCredentialId("u2", "cred-b");
        clearDeviceCredentialId("u1");
        expect(getDeviceCredentialId("u1")).toBeNull();
        expect(getDeviceCredentialId("u2")).toBe("cred-b");
    });
});
