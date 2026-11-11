import { afterEach, describe, expect, it, vi } from "vitest";
import { applyDevtoolsQuery, browserLocalStorage, DEVTOOLS_STORAGE_KEY, readDevtoolsFlag } from "./devtoolsFlag";

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

const throwingStorage = () => {
    const boom = () => {
        throw new Error("denied");
    };
    return { getItem: boom, setItem: boom, removeItem: boom };
};

describe("devtools flag", () => {
    it("reads the flag only when it is stored as 1", () => {
        const s = memoryStorage();
        expect(readDevtoolsFlag(s)).toBe(false);
        s.setItem(DEVTOOLS_STORAGE_KEY, "1");
        expect(readDevtoolsFlag(s)).toBe(true);
        s.setItem(DEVTOOLS_STORAGE_KEY, "yes");
        expect(readDevtoolsFlag(s)).toBe(false);
    });

    it("uses the badger:devtools key", () => {
        expect(DEVTOOLS_STORAGE_KEY).toBe("badger:devtools");
    });

    it("turns the flag on for devtools=1 and stores it", () => {
        const s = memoryStorage();
        expect(applyDevtoolsQuery({ devtools: "1" }, s)).toBe(true);
        expect(s.m.get("badger:devtools")).toBe("1");
    });

    it("turns the flag off for devtools=0 and clears the stored value", () => {
        const s = memoryStorage();
        s.setItem("badger:devtools", "1");
        expect(applyDevtoolsQuery({ devtools: "0" }, s)).toBe(false);
        expect(s.m.has("badger:devtools")).toBe(false);
    });

    it("leaves the flag alone for any other value or no query", () => {
        const s = memoryStorage();
        s.setItem("badger:devtools", "1");
        expect(applyDevtoolsQuery({}, s)).toBeNull();
        expect(applyDevtoolsQuery({ devtools: "true" }, s)).toBeNull();
        expect(applyDevtoolsQuery({ devtools: ["1"] }, s)).toBeNull();
        expect(applyDevtoolsQuery(null, s)).toBeNull();
        expect(s.m.get("badger:devtools")).toBe("1");
    });

    it("tolerates a throwing storage without losing the query's answer", () => {
        const s = throwingStorage();
        expect(readDevtoolsFlag(s)).toBe(false);
        expect(() => applyDevtoolsQuery({ devtools: "1" }, s)).not.toThrow();
        expect(applyDevtoolsQuery({ devtools: "1" }, s)).toBe(true);
        expect(applyDevtoolsQuery({ devtools: "0" }, s)).toBe(false);
    });

    it("tolerates missing storage", () => {
        expect(readDevtoolsFlag(null)).toBe(false);
        expect(readDevtoolsFlag(undefined)).toBe(false);
        expect(applyDevtoolsQuery({ devtools: "1" }, null)).toBe(true);
    });

    it("reads browser localStorage, or null when it is missing", () => {
        const s = memoryStorage();
        vi.stubGlobal("localStorage", s);
        expect(browserLocalStorage()).toBe(s);

        vi.stubGlobal("localStorage", undefined);
        expect(browserLocalStorage()).toBeNull();
    });
});
