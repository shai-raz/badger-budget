import { COLOR_THEMES, DEFAULT_COLOR_THEME } from "@badger/shared-data";
import { afterEach, describe, expect, it, vi } from "vitest";
import { THEMES } from "../theme/themes";
import {
    clearColorMode,
    COLOR_THEME_STORAGE_KEY,
    getThemeStorage,
    PREFERS_DARK_QUERY,
    readSavedColorMode,
    readSavedColorTheme,
    resolveIsDark,
    saveColorMode,
    saveColorTheme,
    themeColorFor,
    THEME_INIT_SCRIPT,
    THEME_STORAGE_KEY,
    type ColorMode,
} from "./theme";

afterEach(() => {
    vi.unstubAllGlobals();
});

function fakeStorage(getItem: () => string | null = () => null) {
    return { getItem: vi.fn(getItem), setItem: vi.fn(), removeItem: vi.fn() };
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

describe("themeColorFor", () => {
    it.each(COLOR_THEMES.flatMap((name) => (["light", "dark"] as const).map((mode) => ({ name, mode }))))(
        "$name $mode is the theme's top-bar surface",
        ({ name, mode }) => {
            expect(themeColorFor(name, mode)).toBe(THEMES[name].surface[mode === "dark" ? 900 : 0]);
        },
    );

    it("keeps the Noir values the status bar always used", () => {
        expect(themeColorFor("noir", "light")).toBe("#FFFFFF");
        expect(themeColorFor("noir", "dark")).toBe("#111111");
    });
});

describe("readSavedColorMode", () => {
    it.each(["dark", "light"] as const)("returns %s when stored", (value) => {
        expect(readSavedColorMode(fakeStorage(() => value))).toBe(value);
    });

    it.each(["auto", "", "Dark", "null"])("ignores stored value %j", (value) => {
        expect(readSavedColorMode(fakeStorage(() => value))).toBeNull();
    });

    it("returns null when nothing is stored", () => {
        expect(readSavedColorMode(fakeStorage(() => null))).toBeNull();
    });

    it("returns null when there is no storage", () => {
        expect(readSavedColorMode(null)).toBeNull();
    });

    it("returns null when getItem throws", () => {
        const storage = {
            getItem: () => {
                throw new Error("SecurityError");
            },
            setItem: vi.fn(),
            removeItem: vi.fn(),
        };
        expect(readSavedColorMode(storage)).toBeNull();
    });

    it("reads the shared storage key", () => {
        const storage = fakeStorage();
        readSavedColorMode(storage);
        expect(storage.getItem).toHaveBeenCalledWith(THEME_STORAGE_KEY);
    });
});

describe("saveColorMode", () => {
    it.each(["dark", "light"] as ColorMode[])("writes %s under the storage key", (theme) => {
        const storage = fakeStorage();
        saveColorMode(storage, theme);
        expect(storage.setItem).toHaveBeenCalledWith(THEME_STORAGE_KEY, theme);
    });

    it("does not throw when setItem throws", () => {
        const storage = {
            getItem: () => null,
            setItem: () => {
                throw new Error("QuotaExceededError");
            },
            removeItem: vi.fn(),
        };
        expect(() => saveColorMode(storage, "dark")).not.toThrow();
    });

    it("is a no-op without storage", () => {
        expect(() => saveColorMode(null, "light")).not.toThrow();
    });
});

describe("clearColorMode", () => {
    it("removes the saved light/dark choice", () => {
        const storage = fakeStorage();
        clearColorMode(storage);
        expect(storage.removeItem).toHaveBeenCalledWith(THEME_STORAGE_KEY);
    });

    it("does not throw when removeItem throws", () => {
        const storage = {
            getItem: () => null,
            setItem: vi.fn(),
            removeItem: () => {
                throw new Error("SecurityError");
            },
        };
        expect(() => clearColorMode(storage)).not.toThrow();
    });

    it("is a no-op without storage", () => {
        expect(() => clearColorMode(null)).not.toThrow();
    });
});

describe("readSavedColorTheme", () => {
    it.each(COLOR_THEMES)("returns %s when stored", (name) => {
        expect(readSavedColorTheme(fakeStorage(() => name))).toBe(name);
    });

    it.each(["retired-theme", "", "Noir", "null", "dark"])("ignores stored value %j", (value) => {
        expect(readSavedColorTheme(fakeStorage(() => value))).toBeNull();
    });

    it("returns null when nothing is stored", () => {
        expect(readSavedColorTheme(fakeStorage(() => null))).toBeNull();
    });

    it("returns null when there is no storage", () => {
        expect(readSavedColorTheme(null)).toBeNull();
    });

    it("returns null when getItem throws", () => {
        const storage = {
            getItem: () => {
                throw new Error("SecurityError");
            },
            setItem: vi.fn(),
            removeItem: vi.fn(),
        };
        expect(readSavedColorTheme(storage)).toBeNull();
    });

    it("reads the colour theme key, not the light/dark key", () => {
        const storage = fakeStorage();
        readSavedColorTheme(storage);
        expect(storage.getItem).toHaveBeenCalledWith(COLOR_THEME_STORAGE_KEY);
        expect(storage.getItem).not.toHaveBeenCalledWith(THEME_STORAGE_KEY);
    });
});

describe("saveColorTheme", () => {
    it.each(COLOR_THEMES)("writes %s under the colour theme key", (name) => {
        const storage = fakeStorage();
        saveColorTheme(storage, name);
        expect(storage.setItem).toHaveBeenCalledWith(COLOR_THEME_STORAGE_KEY, name);
    });

    it("does not throw when setItem throws", () => {
        const storage = {
            getItem: () => null,
            setItem: () => {
                throw new Error("QuotaExceededError");
            },
            removeItem: vi.fn(),
        };
        expect(() => saveColorTheme(storage, "ocean")).not.toThrow();
    });

    it("is a no-op without storage", () => {
        expect(() => saveColorTheme(null, "noir")).not.toThrow();
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
        savedTheme?: string | null;
        getItemThrows?: boolean;
        themeGetItemThrows?: boolean;
        prefersDark?: boolean;
        withMatchMedia?: boolean;
        withMeta?: boolean;
        readyState?: DocumentReadyState;
    }

    function runInitScript({
        saved = null,
        savedTheme = null,
        getItemThrows = false,
        themeGetItemThrows = false,
        prefersDark = false,
        withMatchMedia = true,
        withMeta = true,
        readyState = "complete",
    }: RunOptions = {}) {
        const getItem = vi.fn((key: string) => {
            if (key === COLOR_THEME_STORAGE_KEY) {
                if (themeGetItemThrows) throw new Error("SecurityError");
                return savedTheme;
            }
            if (getItemThrows) throw new Error("SecurityError");
            return saved;
        });
        const matchMedia = vi.fn(() => ({ matches: prefersDark }));
        const fakeWindow: Record<string, unknown> = { localStorage: { getItem, setItem: vi.fn() } };
        if (withMatchMedia) fakeWindow.matchMedia = matchMedia;

        const meta = { setAttribute: vi.fn() };
        const classAdd = vi.fn();
        const setProperty = vi.fn();
        const querySelector = vi.fn(() => (withMeta ? meta : null));
        const addEventListener = vi.fn();
        const fakeDocument = {
            documentElement: { classList: { add: classAdd }, style: { setProperty } },
            querySelector,
            readyState,
            addEventListener,
        };

        expect(() => new Function("window", "document", THEME_INIT_SCRIPT)(fakeWindow, fakeDocument)).not.toThrow();

        return { classAdd, meta, querySelector, matchMedia, getItem, addEventListener, setProperty };
    }

    function expectedIsDark(saved: string | null, prefersDark: boolean, getItemThrows = false) {
        const storage = fakeStorage(() => {
            if (getItemThrows) throw new Error("SecurityError");
            return saved;
        });
        return resolveIsDark(readSavedColorMode(storage), prefersDark);
    }

    it.each(COLOR_THEMES.flatMap((name) => (["dark", "light", null] as const).map((saved) => ({ name, saved }))))(
        "paints $name with saved=$saved exactly as the store and the picker would",
        ({ name, saved }) => {
            for (const prefersDark of [true, false]) {
                const { classAdd, meta, setProperty } = runInitScript({ saved, savedTheme: name, prefersDark });
                const dark = expectedIsDark(saved, prefersDark);
                const mode: ColorMode = dark ? "dark" : "light";
                if (dark) {
                    expect(classAdd).toHaveBeenCalledWith("dark");
                } else {
                    expect(classAdd).not.toHaveBeenCalled();
                }
                expect(setProperty).toHaveBeenCalledWith("--boot-surface", themeColorFor(name, mode));
                expect(meta.setAttribute).toHaveBeenCalledWith("content", themeColorFor(name, mode));
            }
        },
    );

    it("agrees with the store rule for a junk mode value", () => {
        for (const prefersDark of [true, false]) {
            const { classAdd, meta } = runInitScript({ saved: "junk", prefersDark });
            const dark = expectedIsDark("junk", prefersDark);
            if (dark) {
                expect(classAdd).toHaveBeenCalledWith("dark");
            } else {
                expect(classAdd).not.toHaveBeenCalled();
            }
            expect(meta.setAttribute).toHaveBeenCalledWith(
                "content",
                themeColorFor(DEFAULT_COLOR_THEME, dark ? "dark" : "light"),
            );
        }
    });

    it.each(["junk", "", "__proto__", "constructor", "toString", null])(
        "falls back to the default theme for a stored colour theme of %j",
        (savedTheme) => {
            const { setProperty, meta } = runInitScript({ savedTheme, saved: "light" });
            expect(setProperty).toHaveBeenCalledWith("--boot-surface", themeColorFor(DEFAULT_COLOR_THEME, "light"));
            expect(meta.setAttribute).toHaveBeenCalledWith("content", themeColorFor(DEFAULT_COLOR_THEME, "light"));
        },
    );

    it("falls back to the default theme when the colour theme read throws", () => {
        const { setProperty, classAdd } = runInitScript({ themeGetItemThrows: true, saved: "dark" });
        expect(classAdd).toHaveBeenCalledWith("dark");
        expect(setProperty).toHaveBeenCalledWith("--boot-surface", themeColorFor(DEFAULT_COLOR_THEME, "dark"));
    });

    it("falls back to the OS when getItem throws", () => {
        for (const prefersDark of [true, false]) {
            const { classAdd, meta } = runInitScript({ getItemThrows: true, prefersDark });
            const dark = expectedIsDark(null, prefersDark, true);
            expect(classAdd.mock.calls.length > 0).toBe(dark);
            expect(meta.setAttribute).toHaveBeenCalledWith(
                "content",
                themeColorFor(DEFAULT_COLOR_THEME, dark ? "dark" : "light"),
            );
        }
    });

    it("only ever sets --boot-surface inline, never a PrimeVue token", () => {
        const { setProperty } = runInitScript({ saved: "dark", savedTheme: "ocean", prefersDark: true });
        expect(setProperty).toHaveBeenCalledTimes(1);
        expect(setProperty.mock.calls.every(([name]) => name === "--boot-surface")).toBe(true);
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
        expect(meta.setAttribute).toHaveBeenCalledWith("content", themeColorFor(DEFAULT_COLOR_THEME, "light"));
    });

    it("honours a saved dark choice without matchMedia", () => {
        const { classAdd, meta } = runInitScript({ saved: "dark", withMatchMedia: false });
        expect(classAdd).toHaveBeenCalledWith("dark");
        expect(meta.setAttribute).toHaveBeenCalledWith("content", themeColorFor(DEFAULT_COLOR_THEME, "dark"));
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
        expect(meta.setAttribute).toHaveBeenCalledWith("content", themeColorFor(DEFAULT_COLOR_THEME, "dark"));
    });

    it("embeds the shared constants", () => {
        expect(THEME_INIT_SCRIPT).toContain(JSON.stringify(THEME_STORAGE_KEY));
        expect(THEME_INIT_SCRIPT).toContain(JSON.stringify(COLOR_THEME_STORAGE_KEY));
        expect(THEME_INIT_SCRIPT).toContain(JSON.stringify(PREFERS_DARK_QUERY));
        expect(THEME_INIT_SCRIPT).toContain(JSON.stringify(DEFAULT_COLOR_THEME));
    });

    it("embeds the boot surface of every theme and mode", () => {
        for (const name of COLOR_THEMES) {
            expect(THEME_INIT_SCRIPT).toContain(JSON.stringify(themeColorFor(name, "light")));
            expect(THEME_INIT_SCRIPT).toContain(JSON.stringify(themeColorFor(name, "dark")));
        }
    });

    it("stays ES5 and cannot close a script tag", () => {
        expect(THEME_INIT_SCRIPT).not.toContain("</script");
        expect(THEME_INIT_SCRIPT).not.toContain("=>");
        expect(THEME_INIT_SCRIPT).not.toContain("?.");
        expect(THEME_INIT_SCRIPT).not.toMatch(/\b(const|let)\s/);
    });
});
