import { DEFAULT_COLOR_THEME, type ColorThemeName } from "@badger/shared-data";
import { defineStore } from "pinia";
import { computed, ref } from "vue";
import {
    clearColorMode,
    getThemeStorage,
    PREFERS_DARK_QUERY,
    readSavedColorMode,
    readSavedColorTheme,
    resolveIsDark,
    saveColorMode,
    saveColorTheme,
    themeColorFor,
    type ColorMode,
    type ColorModePreference,
} from "../utils/theme";
import { THEMES, type ThemeDefinition } from "../theme/themes";

// Module-level so a second initializeTheme() call (HMR, a re-run plugin) never stacks a second listener.
let systemListenerAttached = false;

export const useThemeStore = defineStore("theme", () => {
    // State
    const isDark = ref(false);
    // True once the user has chosen light or dark; until then the OS preference drives the mode.
    const hasExplicitChoice = ref(false);
    const colorTheme = ref<ColorThemeName>(DEFAULT_COLOR_THEME);

    // Computed
    const colorMode = computed<ColorMode>(() => (isDark.value ? "dark" : "light"));
    const modePreference = computed<ColorModePreference>(() => (hasExplicitChoice.value ? colorMode.value : "system"));
    const definition = computed<ThemeDefinition>(() => THEMES[colorTheme.value]);

    // Actions
    function initializeTheme() {
        if (typeof window === "undefined") return;

        colorTheme.value = readSavedColorTheme(getThemeStorage()) ?? DEFAULT_COLOR_THEME;

        const saved = readSavedColorMode(getThemeStorage());
        hasExplicitChoice.value = saved !== null;

        const mediaQuery = window.matchMedia?.(PREFERS_DARK_QUERY);
        if (mediaQuery && !systemListenerAttached) {
            systemListenerAttached = true;
            mediaQuery.addEventListener("change", (event) => {
                if (hasExplicitChoice.value) return;
                isDark.value = event.matches;
                applyColorMode();
            });
        }

        isDark.value = resolveIsDark(saved, mediaQuery?.matches ?? false);
        applyColorMode();
    }

    function setDarkMode(dark: boolean) {
        isDark.value = dark;
        hasExplicitChoice.value = true;
        saveColorMode(getThemeStorage(), dark ? "dark" : "light");
        applyColorMode();
    }

    function toggleDarkMode() {
        setDarkMode(!isDark.value);
    }

    function setModePreference(pref: ColorModePreference) {
        if (pref === "system") {
            clearColorMode(getThemeStorage());
            hasExplicitChoice.value = false;
            isDark.value = window.matchMedia?.(PREFERS_DARK_QUERY)?.matches ?? false;
            applyColorMode();
            return;
        }
        setDarkMode(pref === "dark");
    }

    function applyColorTheme(name: ColorThemeName) {
        colorTheme.value = name;
        saveColorTheme(getThemeStorage(), name);
        updateBootSurface();
    }

    function applyColorMode() {
        if (typeof window === "undefined") return;
        document.documentElement.classList.toggle("dark", isDark.value);
        updateBootSurface();
    }

    // The html background before the stylesheets load; mirrors the head script's value for the active theme and mode.
    function updateBootSurface() {
        if (typeof window === "undefined") return;
        document.documentElement.style.setProperty("--boot-surface", themeColorFor(colorTheme.value, colorMode.value));
    }

    return {
        isDark,
        colorTheme,
        colorMode,
        modePreference,
        definition,
        initializeTheme,
        setDarkMode,
        toggleDarkMode,
        setModePreference,
        applyColorTheme,
        applyColorMode,
    };
});
