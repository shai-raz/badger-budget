import { defineStore } from "pinia";
import { computed, ref } from "vue";
import {
    getThemeStorage,
    PREFERS_DARK_QUERY,
    readSavedTheme,
    resolveIsDark,
    saveTheme,
    type ThemeName,
} from "../utils/theme";

// Module-level so a second initializeTheme() call (HMR, a re-run plugin) never stacks a second listener.
let systemListenerAttached = false;

export const useThemeStore = defineStore("theme", () => {
    // State
    const isDark = ref(false);
    // True once the user has toggled; until then the OS preference drives the theme.
    const hasExplicitChoice = ref(false);

    // Computed
    const theme = computed<ThemeName>(() => (isDark.value ? "dark" : "light"));

    // Actions
    function initializeTheme() {
        if (typeof window === "undefined") return;

        const saved = readSavedTheme(getThemeStorage());
        hasExplicitChoice.value = saved !== null;

        const mediaQuery = window.matchMedia?.(PREFERS_DARK_QUERY);
        if (mediaQuery && !systemListenerAttached) {
            systemListenerAttached = true;
            mediaQuery.addEventListener("change", (event) => {
                if (hasExplicitChoice.value) return;
                isDark.value = event.matches;
                applyTheme();
            });
        }

        isDark.value = resolveIsDark(saved, mediaQuery?.matches ?? false);
        applyTheme();
    }

    function setTheme(dark: boolean) {
        isDark.value = dark;
        hasExplicitChoice.value = true;
        saveTheme(getThemeStorage(), dark ? "dark" : "light");
        applyTheme();
    }

    function toggleTheme() {
        setTheme(!isDark.value);
    }

    function applyTheme() {
        if (typeof window === "undefined") return;
        document.documentElement.classList.toggle("dark", isDark.value);
    }

    return {
        isDark,
        theme,
        initializeTheme,
        setTheme,
        toggleTheme,
        applyTheme,
    };
});
