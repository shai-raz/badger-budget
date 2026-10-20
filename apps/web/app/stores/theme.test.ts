import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Listener = (event: { matches: boolean }) => void;

function setup({ saved = null as string | null, prefersDark = false } = {}) {
    const values = new Map<string, string>();
    if (saved !== null) values.set("theme-preference", saved);
    const storage = {
        getItem: vi.fn((key: string) => values.get(key) ?? null),
        setItem: vi.fn((key: string, value: string) => values.set(key, value)),
    };
    const listeners: Listener[] = [];
    const mediaQuery = {
        matches: prefersDark,
        addEventListener: vi.fn((_type: string, listener: Listener) => listeners.push(listener)),
    };
    const classList = { toggle: vi.fn() };
    vi.stubGlobal("window", { localStorage: storage, matchMedia: vi.fn(() => mediaQuery) });
    vi.stubGlobal("document", { documentElement: { classList } });
    return {
        storage,
        mediaQuery,
        classList,
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
        expect(store.theme).toBe("dark");
    });

    it("follows a light OS when nothing is saved", async () => {
        setup({ prefersDark: false });
        const store = await loadStore();
        store.initializeTheme();
        expect(store.isDark).toBe(false);
        expect(store.theme).toBe("light");
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

        store.toggleTheme();
        expect(store.isDark).toBe(true);

        env.osChange(false);
        expect(store.isDark).toBe(true);
    });

    it("saves a toggle and applies the class", async () => {
        const env = setup({ prefersDark: false });
        const store = await loadStore();
        store.initializeTheme();

        store.toggleTheme();

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

        expect(() => store.toggleTheme()).not.toThrow();
        expect(store.isDark).toBe(false);
        expect(env.classList.toggle).toHaveBeenLastCalledWith("dark", false);
    });
});
