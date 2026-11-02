import { defineStore } from "pinia";
import { computed, ref } from "vue";
import {
    getThemeStorage,
    PREFERS_DARK_QUERY,
    readSavedColorMode,
    resolveIsDark,
    saveColorMode,
    type ColorMode,
} from "../utils/theme";
import { noirTheme, type ThemeDefinition } from "../theme/themes";

// Module-level so a second initializeTheme() call (HMR, a re-run plugin) never stacks a second listener.
let systemListenerAttached = false;

export const useThemeStore = defineStore("theme", () => {
    // State
    const isDark = ref(false);
    // True once the user has toggled; until then the OS preference drives the theme.
    const hasExplicitChoice = ref(false);

    // Computed
    const colorMode = computed<ColorMode>(() => (isDark.value ? "dark" : "light"));
    // The active theme. Fixed to Noir until the theme selector lands; it becomes the selected theme then.
    const definition = computed<ThemeDefinition>(() => noirTheme);

    // Actions
    function initializeTheme() {
        if (typeof window === "undefined") return;

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

    function applyColorMode() {
        if (typeof window === "undefined") return;
        document.documentElement.classList.toggle("dark", isDark.value);
    }

    return {
        isDark,
        colorMode,
        definition,
        initializeTheme,
        setDarkMode,
        toggleDarkMode,
        applyColorMode,
    };
});
