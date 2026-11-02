import { COLOR_THEMES, DEFAULT_COLOR_THEME, isColorThemeName, type ColorThemeName } from "@badger/shared-data";
import type { IAuthUser } from "@badger/types";
import { THEMES } from "../theme/themes";

export type ColorMode = "light" | "dark";
export type ColorModePreference = ColorMode | "system";

// Kept as-is on purpose (decision Q1): renaming it would drop existing users' saved choice.
export const THEME_STORAGE_KEY = "theme-preference";
// The saved colour theme name (a COLOR_THEMES entry). Separate from the light/dark key above.
export const COLOR_THEME_STORAGE_KEY = "color-theme";
export const PREFERS_DARK_QUERY = "(prefers-color-scheme: dark)";

type ThemeStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

// Status-bar colour = the top bar under it (#page-top-bar: bg-surface-0 / dark:bg-surface-900).
// The same colour is the first-paint html background, so it is also what the head script paints.
export function themeColorFor(name: ColorThemeName, mode: ColorMode): string {
    return THEMES[name].surface[mode === "dark" ? 900 : 0];
}

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

/** Removes the saved light/dark choice, so the OS preference decides again. Storage failures are ignored. */
export function clearColorMode(storage: ThemeStorage | null): void {
    if (!storage) return;
    try {
        storage.removeItem(THEME_STORAGE_KEY);
    } catch {
        // Intentionally silent.
    }
}

/** Only a known theme name counts as a saved choice; anything else means the default theme. */
export function readSavedColorTheme(storage: ThemeStorage | null): ColorThemeName | null {
    if (!storage) return null;
    try {
        const value = storage.getItem(COLOR_THEME_STORAGE_KEY);
        return isColorThemeName(value) ? value : null;
    } catch {
        return null;
    }
}

/** Storage failures are ignored: the theme still applies for this page. */
export function saveColorTheme(storage: ThemeStorage | null, name: ColorThemeName): void {
    if (!storage) return;
    try {
        storage.setItem(COLOR_THEME_STORAGE_KEY, name);
    } catch {
        // Intentionally silent.
    }
}

/**
 * The theme the account should show, or null when the device cache decides: no user, or the shared demo account
 * (its theme stays on this device). A user with no stored theme gets the default.
 */
export function accountColorTheme(user: IAuthUser | null | undefined): ColorThemeName | null {
    if (!user || user.isDemo) return null;
    return user.colorTheme ?? DEFAULT_COLOR_THEME;
}

/** A saved choice wins; with no saved choice the OS preference decides. */
export function resolveIsDark(saved: ColorMode | null, prefersDark: boolean): boolean {
    return saved === null ? prefersDark : saved === "dark";
}

// Boot surface per theme and mode, embedded in the head script. Built from the constants so it cannot drift.
const BOOT_SURFACES: Record<ColorThemeName, Record<ColorMode, string>> = Object.fromEntries(
    COLOR_THEMES.map((name) => [name, { light: themeColorFor(name, "light"), dark: themeColorFor(name, "dark") }]),
) as Record<ColorThemeName, Record<ColorMode, string>>;

// Inline, ES5-only IIFE that runs before first paint (see the head script in the Nuxt config).
// It must agree with readSavedColorMode + resolveIsDark + readSavedColorTheme; theme.test.ts asserts that.
// Built with JSON.stringify so the keys, query and colours cannot drift from the constants above.
// It paints the page through `--boot-surface` only. It never sets `--p-*` inline, because an inline value
// would beat PrimeVue's stylesheet and later theme swaps would not repaint.
// The theme-color meta is rendered after this script in <head>, so its update waits for DOMContentLoaded.
export const THEME_INIT_SCRIPT: string = `(function(){try{var B=${JSON.stringify(BOOT_SURFACES)};var s=null;try{s=window.localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)})}catch(e){}var d=s==="dark"||(s!=="light"&&!!window.matchMedia&&window.matchMedia(${JSON.stringify(PREFERS_DARK_QUERY)}).matches);if(d)document.documentElement.classList.add("dark");var t=null;try{t=window.localStorage.getItem(${JSON.stringify(COLOR_THEME_STORAGE_KEY)})}catch(e){}var n=Object.prototype.hasOwnProperty.call(B,t)?t:${JSON.stringify(DEFAULT_COLOR_THEME)};var c=B[n][d?"dark":"light"];document.documentElement.style.setProperty("--boot-surface",c);var p=function(){var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute("content",c)};if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",p);else p()}catch(e){}})()`;

// The Mode control's options, shared by the Appearance page and the Settings row's subtitle.
// `icon` is a PrimeIcons class; the Settings row reads only `label`.
export const COLOR_MODE_OPTIONS: { label: string; value: ColorModePreference; icon: string }[] = [
    { label: "System", value: "system", icon: "pi-desktop" },
    { label: "Light", value: "light", icon: "pi-sun" },
    { label: "Dark", value: "dark", icon: "pi-moon" },
];
