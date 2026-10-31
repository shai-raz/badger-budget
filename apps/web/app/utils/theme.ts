export type ColorMode = "light" | "dark";

// Kept as-is on purpose (decision Q1): renaming it would drop existing users' saved choice.
export const THEME_STORAGE_KEY = "theme-preference";
export const PREFERS_DARK_QUERY = "(prefers-color-scheme: dark)";

// Status-bar colour = the top bar under it (#page-top-bar: bg-surface-0 / dark:bg-surface-900).
export const THEME_COLOR: Record<ColorMode, string> = { light: "#FFFFFF", dark: "#111111" };

type ThemeStorage = Pick<Storage, "getItem" | "setItem">;

/** The getter itself can throw (e.g. SecurityError when site data is blocked), so it is guarded too. */
export function getThemeStorage(): ThemeStorage | null {
    try {
        return typeof window === "undefined" ? null : window.localStorage;
    } catch {
        return null;
    }
}

/** Only "light" and "dark" count as a saved choice; anything else means "follow the OS". */
export function readSavedColorMode(storage: ThemeStorage | null): ColorMode | null {
    if (!storage) return null;
    try {
        const value = storage.getItem(THEME_STORAGE_KEY);
        return value === "light" || value === "dark" ? value : null;
    } catch {
        return null;
    }
}

/** Storage failures (private mode, quota, blocked site data) are ignored: the theme still applies for this page. */
export function saveColorMode(storage: ThemeStorage | null, theme: ColorMode): void {
    if (!storage) return;
    try {
        storage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
        // Intentionally silent.
    }
}

/** A saved choice wins; with no saved choice the OS preference decides. */
export function resolveIsDark(saved: ColorMode | null, prefersDark: boolean): boolean {
    return saved === null ? prefersDark : saved === "dark";
}

// Inline, ES5-only IIFE that runs before first paint (see the head script in the Nuxt config).
// It must agree with readSavedColorMode + resolveIsDark; theme.test.ts asserts that.
// Built with JSON.stringify so the key, query and colours cannot drift from the constants above.
// The theme-color meta is rendered after this script in <head>, so its update waits for DOMContentLoaded.
export const THEME_INIT_SCRIPT: string = `(function(){try{var s=null;try{s=window.localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)})}catch(e){}var d=s==="dark"||(s!=="light"&&!!window.matchMedia&&window.matchMedia(${JSON.stringify(PREFERS_DARK_QUERY)}).matches);if(d)document.documentElement.classList.add("dark");var p=function(){var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute("content",d?${JSON.stringify(THEME_COLOR.dark)}:${JSON.stringify(THEME_COLOR.light)})};if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",p);else p()}catch(e){}})()`;
