import { usePreset } from "@primeuix/themes";
import { DEFAULT_COLOR_THEME, type ColorThemeName } from "@badger/shared-data";
import { useAuthStore } from "~/stores/auth";
import { themePresets } from "~/theme/preset";
import { accountColorTheme, themeColorFor } from "~/utils/theme";

export default defineNuxtPlugin(() => {
    const themeStore = useThemeStore();

    // Initialize theme on app startup
    themeStore.initializeTheme();

    // nuxt.config's static preset is Noir, so only a different theme needs applying.
    let applied: ColorThemeName = DEFAULT_COLOR_THEME;
    watch(
        () => themeStore.colorTheme,
        (name) => {
            if (name === applied) return;
            applied = name;
            usePreset(themePresets[name]);
        },
        { immediate: true },
    );

    // The account's theme wins over the device cache, except for the shared demo account, which stays device-only.
    // Watches the user's identity only: a save's response replaces the user object, and that must not re-apply
    // an older pick over a newer one. The user is loaded before this runs (auth-init.ts awaits loadUser).
    // Logout leaves the theme as it is.
    const authStore = useAuthStore();
    watch(
        () => authStore.user?.id,
        () => {
            const name = accountColorTheme(authStore.user);
            if (name) themeStore.applyColorTheme(name);
        },
        { immediate: true },
    );

    // unhead dedupes meta by name, so this replaces the static theme-color from nuxt.config.
    useHead({
        meta: [
            {
                name: "theme-color",
                content: computed(() => themeColorFor(themeStore.colorTheme, themeStore.colorMode)),
            },
        ],
    });
});
