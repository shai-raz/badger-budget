import { afterEach, describe, expect, it, vi } from "vitest";
import {
    getThemeStorage,
    PREFERS_DARK_QUERY,
    readSavedTheme,
    resolveIsDark,
    saveTheme,
    THEME_COLOR,
    THEME_INIT_SCRIPT,
    THEME_STORAGE_KEY,
    type ThemeName,
} from "./theme";

afterEach(() => {
    vi.unstubAllGlobals();
});

function fakeStorage(getItem: () => string | null = () => null) {
    return { getItem: vi.fn(getItem), setItem: vi.fn() };
}

describe("resolveIsDark", () => {
    it.each([
        ["dark", true, true],
        ["dark", false, true],
        ["light", true, false],
        ["light", false, false],
    ] as const)("saved=%s prefersDark=%s -> %s", (saved, prefersDark, expected) => {
        expect(resolveIsDark(saved, prefersDark)).toBe(expected);
    });

    it("follows the OS when nothing is saved", () => {
        expect(resolveIsDark(null, true)).toBe(true);
        expect(resolveIsDark(null, false)).toBe(false);
    });
});

describe("readSavedTheme", () => {
    it.each(["dark", "light"] as const)("returns %s when stored", (value) => {
        expect(readSavedTheme(fakeStorage(() => value))).toBe(value);
    });

    it.each(["auto", "", "Dark", "null"])("ignores stored value %j", (value) => {
        expect(readSavedTheme(fakeStorage(() => value))).toBeNull();
    });

    it("returns null when nothing is stored", () => {
        expect(readSavedTheme(fakeStorage(() => null))).toBeNull();
    });

    it("returns null when there is no storage", () => {
        expect(readSavedTheme(null)).toBeNull();
    });

    it("returns null when getItem throws", () => {
        const storage = {
            getItem: () => {
                throw new Error("SecurityError");
            },
            setItem: vi.fn(),
        };
        expect(readSavedTheme(storage)).toBeNull();
    });

    it("reads the shared storage key", () => {
        const storage = fakeStorage();
        readSavedTheme(storage);
        expect(storage.getItem).toHaveBeenCalledWith(THEME_STORAGE_KEY);
    });
});

describe("saveTheme", () => {
    it.each(["dark", "light"] as ThemeName[])("writes %s under the storage key", (theme) => {
        const storage = fakeStorage();
        saveTheme(storage, theme);
        expect(storage.setItem).toHaveBeenCalledWith(THEME_STORAGE_KEY, theme);
    });

    it("does not throw when setItem throws", () => {
        const storage = {
            getItem: () => null,
            setItem: () => {
                throw new Error("QuotaExceededError");
            },
        };
        expect(() => saveTheme(storage, "dark")).not.toThrow();
    });

    it("is a no-op without storage", () => {
        expect(() => saveTheme(null, "light")).not.toThrow();
    });
});

describe("getThemeStorage", () => {
    it("returns null when window is undefined", () => {
        expect(getThemeStorage()).toBeNull();
    });

    it("returns window.localStorage when available", () => {
        const localStorage = fakeStorage();
        vi.stubGlobal("window", { localStorage });
        expect(getThemeStorage()).toBe(localStorage);
    });

    it("returns null when the localStorage getter throws", () => {
        vi.stubGlobal(
            "window",
            Object.defineProperty({}, "localStorage", {
                get() {
                    throw new Error("SecurityError");
                },
            }),
        );
        expect(getThemeStorage()).toBeNull();
    });
});

describe("THEME_INIT_SCRIPT", () => {
    interface RunOptions {
        saved?: string | null;
        getItemThrows?: boolean;
        prefersDark?: boolean;
        withMatchMedia?: boolean;
        withMeta?: boolean;
        readyState?: DocumentReadyState;
    }

    function runInitScript({
        saved = null,
        getItemThrows = false,
        prefersDark = false,
        withMatchMedia = true,
        withMeta = true,
        readyState = "complete",
    }: RunOptions = {}) {
        const getItem = vi.fn(() => {
            if (getItemThrows) throw new Error("SecurityError");
            return saved;
        });
        const matchMedia = vi.fn(() => ({ matches: prefersDark }));
        const fakeWindow: Record<string, unknown> = { localStorage: { getItem, setItem: vi.fn() } };
        if (withMatchMedia) fakeWindow.matchMedia = matchMedia;

        const meta = { setAttribute: vi.fn() };
        const classAdd = vi.fn();
        const querySelector = vi.fn(() => (withMeta ? meta : null));
        const addEventListener = vi.fn();
        const fakeDocument = {
            documentElement: { classList: { add: classAdd } },
            querySelector,
            readyState,
            addEventListener,
        };

        expect(() => new Function("window", "document", THEME_INIT_SCRIPT)(fakeWindow, fakeDocument)).not.toThrow();

        return { classAdd, meta, querySelector, matchMedia, getItem, addEventListener };
    }

    function expectedIsDark(saved: string | null, prefersDark: boolean, getItemThrows = false) {
        const storage = fakeStorage(() => {
            if (getItemThrows) throw new Error("SecurityError");
            return saved;
        });
        return resolveIsDark(readSavedTheme(storage), prefersDark);
    }

    it.each(["dark", "light", null, "junk"])("agrees with the store rule for saved=%j", (saved) => {
        for (const prefersDark of [true, false]) {
            const { classAdd, meta } = runInitScript({ saved, prefersDark });
            const dark = expectedIsDark(saved, prefersDark);
            if (dark) {
                expect(classAdd).toHaveBeenCalledWith("dark");
            } else {
                expect(classAdd).not.toHaveBeenCalled();
            }
            expect(meta.setAttribute).toHaveBeenCalledWith("content", THEME_COLOR[dark ? "dark" : "light"]);
        }
    });

    it("falls back to the OS when getItem throws", () => {
        for (const prefersDark of [true, false]) {
            const { classAdd, meta } = runInitScript({ getItemThrows: true, prefersDark });
            const dark = expectedIsDark(null, prefersDark, true);
            expect(classAdd.mock.calls.length > 0).toBe(dark);
            expect(meta.setAttribute).toHaveBeenCalledWith("content", THEME_COLOR[dark ? "dark" : "light"]);
        }
    });

    it("does not consult matchMedia when a saved choice exists", () => {
        const { matchMedia, classAdd } = runInitScript({ saved: "light", prefersDark: true });
        expect(matchMedia).not.toHaveBeenCalled();
        expect(classAdd).not.toHaveBeenCalled();
    });

    it("uses the OS query when no choice is saved", () => {
        const { matchMedia } = runInitScript({ saved: null, prefersDark: true });
        expect(matchMedia).toHaveBeenCalledWith(PREFERS_DARK_QUERY);
    });

    it("stays light without matchMedia when nothing is saved", () => {
        const { classAdd, meta } = runInitScript({ saved: null, withMatchMedia: false });
        expect(classAdd).not.toHaveBeenCalled();
        expect(meta.setAttribute).toHaveBeenCalledWith("content", THEME_COLOR.light);
    });

    it("honours a saved dark choice without matchMedia", () => {
        const { classAdd, meta } = runInitScript({ saved: "dark", withMatchMedia: false });
        expect(classAdd).toHaveBeenCalledWith("dark");
        expect(meta.setAttribute).toHaveBeenCalledWith("content", THEME_COLOR.dark);
    });

    it("does not throw when the theme-color meta is missing", () => {
        const { classAdd, querySelector } = runInitScript({ saved: "dark", withMeta: false });
        expect(classAdd).toHaveBeenCalledWith("dark");
        expect(querySelector).toHaveBeenCalledWith('meta[name="theme-color"]');
    });

    it("defers the theme-color update to DOMContentLoaded while the document is still parsing", () => {
        const { classAdd, meta, addEventListener } = runInitScript({ saved: "dark", readyState: "loading" });
        expect(classAdd).toHaveBeenCalledWith("dark");
        expect(meta.setAttribute).not.toHaveBeenCalled();
        expect(addEventListener).toHaveBeenCalledWith("DOMContentLoaded", expect.any(Function));

        const onReady = addEventListener.mock.calls[0]?.[1] as (() => void) | undefined;
        onReady?.();
        expect(meta.setAttribute).toHaveBeenCalledWith("content", THEME_COLOR.dark);
    });

    it("embeds the shared constants", () => {
        expect(THEME_INIT_SCRIPT).toContain(JSON.stringify(THEME_STORAGE_KEY));
        expect(THEME_INIT_SCRIPT).toContain(JSON.stringify(PREFERS_DARK_QUERY));
        expect(THEME_INIT_SCRIPT).toContain(JSON.stringify(THEME_COLOR.light));
        expect(THEME_INIT_SCRIPT).toContain(JSON.stringify(THEME_COLOR.dark));
    });

    it("stays ES5 and cannot close a script tag", () => {
        expect(THEME_INIT_SCRIPT).not.toContain("</script");
        expect(THEME_INIT_SCRIPT).not.toContain("=>");
        expect(THEME_INIT_SCRIPT).not.toContain("?.");
    });
});
