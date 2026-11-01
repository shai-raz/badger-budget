import Aura from "@primeuix/themes/aura";
import { COLOR_THEMES, type ColorThemeName } from "@badger/shared-data";
import { BUDGET_LEVEL_TOKENS, THEMES, type ThemeDefinition } from "./themes";

// Builds the PrimeVue preset for a theme: the Aura base with the theme's primary
// ramp, surfaces and per-scheme mappings, plus the amount and budget tokens.
export function buildPreset(def: ThemeDefinition) {
    return {
        ...Aura,
        semantic: {
            ...Aura.semantic,
            primary: def.primary,
            success: {
                50: "#F0FDF4",
                100: "#DCFCE7",
                200: "#BBF7D0",
                300: "#86EFAC",
                400: "#4ADE80",
                500: "#22C55E",
                600: "#16A34A",
                700: "#15803D",
                800: "#166534",
                900: "#145231",
                950: "#0C2818",
            },
            warn: {
                50: "#FFFBEB",
                100: "#FEF3C7",
                200: "#FDE68A",
                300: "#FCD34D",
                400: "#FBBF24",
                500: "#F59E0B",
                600: "#D97706",
                700: "#B45309",
                800: "#92400E",
                900: "#78350F",
                950: "#451A03",
            },
            error: {
                50: "#FEF2F2",
                100: "#FEE2E2",
                200: "#FECACA",
                300: "#FCA5A5",
                400: "#F87171",
                500: "#F43F5E",
                600: "#E11D48",
                700: "#BE123C",
                800: "#9F1239",
                900: "#881337",
                950: "#500724",
            },
            colorScheme: {
                ...(Aura.semantic?.colorScheme ?? {}),
                light: {
                    ...(Aura.semantic?.colorScheme?.light ?? {}),
                    surface: def.surface,
                    primary: def.light.primary,
                    highlight: def.light.highlight,
                    amount: def.light.amount,
                    budget: BUDGET_LEVEL_TOKENS,
                },
                dark: {
                    ...(Aura.semantic?.colorScheme?.dark ?? {}),
                    surface: def.surface,
                    primary: def.dark.primary,
                    highlight: def.dark.highlight,
                    amount: def.dark.amount,
                    budget: BUDGET_LEVEL_TOKENS,
                },
            },
        },
        // Flat, borderless card look app-wide (see apps/web/DESIGN.md > Surfaces):
        // shadow off via the preset token, border on via the global pt in
        // nuxt.config.ts (Card has no border token of its own). Background/radius
        // stay on Aura's own tokens.
        components: {
            ...(Aura.components ?? {}),
            card: {
                ...(Aura.components?.card ?? {}),
                root: {
                    ...(Aura.components?.card?.root ?? {}),
                    shadow: "none",
                },
            },
            // Dialog content is a scroll container with no top padding, so a Message
            // (or focus ring) as its first child has its outline clipped. The 0.25rem
            // moves from the header's bottom padding to the content's top padding, so
            // the visual spacing is unchanged.
            dialog: {
                ...(Aura.components?.dialog ?? {}),
                header: {
                    ...(Aura.components?.dialog?.header ?? {}),
                    padding: "1.25rem 1.25rem 1rem",
                },
                content: {
                    ...(Aura.components?.dialog?.content ?? {}),
                    padding: "0.25rem 1.25rem 1.25rem 1.25rem",
                },
            },
            // Aura's dark outlined primary border ({primary.700}, #141414) disappears on the
            // #111111 surface (used by the AccountTile 'Update' button). Light is untouched.
            button: {
                ...(Aura.components?.button ?? {}),
                colorScheme: {
                    ...(Aura.components?.button?.colorScheme ?? {}),
                    dark: {
                        ...(Aura.components?.button?.colorScheme?.dark ?? {}),
                        outlined: {
                            ...(Aura.components?.button?.colorScheme?.dark?.outlined ?? {}),
                            primary: {
                                ...(Aura.components?.button?.colorScheme?.dark?.outlined?.primary ?? {}),
                                borderColor: "{surface.500}",
                            },
                        },
                    },
                },
            },
        },
    };
}

// One PrimeVue preset per shipped theme, built from COLOR_THEMES so a new theme needs
// only its name there and its definition in THEMES.
export const themePresets = Object.fromEntries(COLOR_THEMES.map((name) => [name, buildPreset(THEMES[name])])) as Record<
    ColorThemeName,
    ReturnType<typeof buildPreset>
>;

// Custom Aura preset with black and white base palette
const customAuraPreset = themePresets.noir;
const surfacePalette = THEMES.noir.surface;

export { surfacePalette, customAuraPreset };
