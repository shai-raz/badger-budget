import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Listener = (event: { matches: boolean }) => void;

function setup({ saved = null as string | null, savedTheme = null as string | null, prefersDark = false } = {}) {
    const values = new Map<string, string>();
    if (saved !== null) values.set("theme-preference", saved);
    if (savedTheme !== null) values.set("color-theme", savedTheme);
    const storage = {
        getItem: vi.fn((key: string) => values.get(key) ?? null),
        setItem: vi.fn((key: string, value: string) => values.set(key, value)),
        removeItem: vi.fn((key: string) => values.delete(key)),
    };
    const listeners: Listener[] = [];
    const mediaQuery = {
        matches: prefersDark,
        addEventListener: vi.fn((_type: string, listener: Listener) => listeners.push(listener)),
    };
    const classList = { toggle: vi.fn() };
    const style = { setProperty: vi.fn() };
    vi.stubGlobal("window", { localStorage: storage, matchMedia: vi.fn(() => mediaQuery) });
    vi.stubGlobal("document", { documentElement: { classList, style } });
    return {
        storage,
        mediaQuery,
        classList,
        style,
        /** Simulates the OS colour scheme changing while the page is open. */
        osChange(dark: boolean) {
            mediaQuery.matches = dark;
            listeners.forEach((listener) => listener({ matches: dark }));
        },
    };
}

async function loadStore() {
    const pinia = createPinia();
    setActivePinia(pinia);
    const { useThemeStore } = await import("./theme");
    return useThemeStore();
}

beforeEach(() => {
    // The OS-change listener is attached once per module instance, so each test gets a fresh module.
    vi.resetModules();
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("theme store", () => {
    it("follows a dark OS when nothing is saved", async () => {
        setup({ prefersDark: true });
        const store = await loadStore();
        store.initializeTheme();
        expect(store.isDark).toBe(true);
        expect(store.colorMode).toBe("dark");
    });

    it("follows a light OS when nothing is saved", async () => {
        setup({ prefersDark: false });
        const store = await loadStore();
        store.initializeTheme();
        expect(store.isDark).toBe(false);
        expect(store.colorMode).toBe("light");
    });

    it("lets a saved choice win over the OS", async () => {
        setup({ saved: "light", prefersDark: true });
        const store = await loadStore();
        store.initializeTheme();
        expect(store.isDark).toBe(false);
    });

    it("follows OS changes live until the user has chosen", async () => {
        const env = setup({ prefersDark: false });
        const store = await loadStore();
        store.initializeTheme();

        env.osChange(true);
        expect(store.isDark).toBe(true);
        expect(env.classList.toggle).toHaveBeenLastCalledWith("dark", true);

        env.osChange(false);
        expect(store.isDark).toBe(false);
    });

    it("ignores OS changes once the user has chosen", async () => {
        const env = setup({ prefersDark: false });
        const store = await loadStore();
        store.initializeTheme();

        store.toggleDarkMode();
        expect(store.isDark).toBe(true);

        env.osChange(false);
        expect(store.isDark).toBe(true);
    });

    it("saves a toggle and applies the class", async () => {
        const env = setup({ prefersDark: false });
        const store = await loadStore();
        store.initializeTheme();

        store.toggleDarkMode();

        expect(env.storage.setItem).toHaveBeenCalledWith("theme-preference", "dark");
        expect(env.classList.toggle).toHaveBeenLastCalledWith("dark", true);
    });

    it("treats a saved choice from a previous visit as explicit", async () => {
        const env = setup({ saved: "dark", prefersDark: false });
        const store = await loadStore();
        store.initializeTheme();

        env.osChange(false);
        expect(store.isDark).toBe(true);
    });

    it("attaches only one OS listener across repeated initialization", async () => {
        const env = setup({ prefersDark: false });
        const store = await loadStore();
        store.initializeTheme();
        store.initializeTheme();
        expect(env.mediaQuery.addEventListener).toHaveBeenCalledTimes(1);
    });

    it("still applies the theme when storage throws", async () => {
        const env = setup({ prefersDark: true });
        env.storage.getItem.mockImplementation(() => {
            throw new Error("SecurityError");
        });
        env.storage.setItem.mockImplementation(() => {
            throw new Error("QuotaExceededError");
        });
        const store = await loadStore();
        store.initializeTheme();
        expect(store.isDark).toBe(true);

        expect(() => store.toggleDarkMode()).not.toThrow();
        expect(store.isDark).toBe(false);
        expect(env.classList.toggle).toHaveBeenLastCalledWith("dark", false);
    });

    it("exposes the Noir theme definition", async () => {
        setup();
        const store = await loadStore();
        const { noirTheme } = await import("../theme/themes");
        expect(store.definition).toBe(noirTheme);
    });

    it("reads the cached colour theme on init", async () => {
        setup({ savedTheme: "ocean" });
        const store = await loadStore();
        store.initializeTheme();
        expect(store.colorTheme).toBe("ocean");
        const { oceanTheme } = await import("../theme/themes");
        expect(store.definition).toBe(oceanTheme);
    });

    it("falls back to Noir when the cached colour theme is invalid", async () => {
        setup({ savedTheme: "neon" });
        const store = await loadStore();
        store.initializeTheme();
        expect(store.colorTheme).toBe("noir");
    });

    it("saves an applied colour theme and paints the boot surface for the current mode", async () => {
        const env = setup({ prefersDark: true });
        const store = await loadStore();
        store.initializeTheme();

        store.applyColorTheme("ocean");

        expect(store.colorTheme).toBe("ocean");
        expect(env.storage.setItem).toHaveBeenCalledWith("color-theme", "ocean");
        expect(env.style.setProperty).toHaveBeenLastCalledWith("--boot-surface", "#0F1724");
    });

    it("repaints the boot surface when the mode changes", async () => {
        const env = setup({ prefersDark: false });
        const store = await loadStore();
        store.initializeTheme();
        store.applyColorTheme("ocean");

        store.setDarkMode(true);
        expect(env.style.setProperty).toHaveBeenLastCalledWith("--boot-surface", "#0F1724");
    });

    it("reports System while no mode is chosen and the chosen mode after one", async () => {
        setup({ prefersDark: false });
        const store = await loadStore();
        store.initializeTheme();
        expect(store.modePreference).toBe("system");

        store.setModePreference("dark");
        expect(store.modePreference).toBe("dark");
    });

    it("returns to System: removes the saved mode, follows the OS and tracks it live", async () => {
        const env = setup({ saved: "light", prefersDark: true });
        const store = await loadStore();
        store.initializeTheme();
        expect(store.isDark).toBe(false);

        store.setModePreference("system");

        expect(env.storage.removeItem).toHaveBeenCalledWith("theme-preference");
        expect(store.modePreference).toBe("system");
        expect(store.isDark).toBe(true);

        env.osChange(false);
        expect(store.isDark).toBe(false);
    });

    it("pins light and dark, and ignores later OS changes", async () => {
        const env = setup({ prefersDark: false });
        const store = await loadStore();
        store.initializeTheme();

        store.setModePreference("dark");
        expect(store.isDark).toBe(true);
        env.osChange(false);
        expect(store.isDark).toBe(true);

        store.setModePreference("light");
        expect(store.isDark).toBe(false);
        env.osChange(true);
        expect(store.isDark).toBe(false);
    });

    it("makes the choice explicit again when toggled after System", async () => {
        const env = setup({ prefersDark: false });
        const store = await loadStore();
        store.initializeTheme();
        store.setModePreference("system");

        store.toggleDarkMode();
        expect(store.modePreference).toBe("dark");

        env.osChange(false);
        expect(store.isDark).toBe(true);
    });
});
