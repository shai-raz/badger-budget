import { DEFAULT_COLOR_THEME } from "@badger/shared-data";
import { themeColorFor } from "~/utils/theme";

export default defineNuxtPlugin(() => {
    const themeStore = useThemeStore();

    // Initialize theme on app startup
    themeStore.initializeTheme();

    // unhead dedupes meta by name, so this replaces the static theme-color from nuxt.config.
    useHead({
        meta: [
            {
                name: "theme-color",
                content: computed(() => themeColorFor(DEFAULT_COLOR_THEME, themeStore.colorMode)),
            },
        ],
    });
});
