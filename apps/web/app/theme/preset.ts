import Aura from "@primeuix/themes/aura";

// Charcoal surface palette shared by both color schemes.
// PrimeVue v4 only reads surfaces from `semantic.colorScheme.{light,dark}.surface`
// (NOT from `semantic.surface`), so this must be injected into each scheme below.
// Light mode keeps a subtle light-gray look; dark mode uses the deep charcoal end
// (#1F2022 / #111111) instead of Aura's default zinc.
const surfacePalette = {
    0: "#FFFFFF",
    50: "#F9F9F9",
    100: "#F3F4F6",
    200: "#E5E7EB",
    300: "#D1D5DB",
    400: "#9CA3AF",
    500: "#6B7280",
    600: "#4B5563",
    700: "#374151",
    800: "#1F2022",
    900: "#111111",
    950: "#0A0A0A",
};

// Custom Aura preset with black and white base palette
const customAuraPreset = {
    ...Aura,
    semantic: {
        ...Aura.semantic,
        primary: {
            50: "#EDEDED",
            100: "#CFCFCF",
            200: "#A8A8A8",
            300: "#7A7A7A",
            400: "#545454",
            500: "#2F2F2F",
            600: "#1F1F1F",
            700: "#141414",
            800: "#0D0D0D",
            900: "#070707",
            950: "#020202",
        },
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
                surface: surfacePalette,
                // Copied verbatim from Aura's light scheme so light mode is unchanged.
                primary: {
                    color: "{primary.500}",
                    contrastColor: "#ffffff",
                    hoverColor: "{primary.600}",
                    activeColor: "{primary.700}",
                },
                highlight: {
                    background: "{primary.50}",
                    focusBackground: "{primary.100}",
                    color: "{primary.700}",
                    focusColor: "{primary.800}",
                },
            },
            // Noir-style dark: primary maps to near-white like PrimeVue's Noir preset,
            // because the near-black ramp's default {primary.400} gave ~2.5:1 contrast.
            // The key is `contrastColor` (not `inverseColor`), which Aura components read.
            dark: {
                ...(Aura.semantic?.colorScheme?.dark ?? {}),
                surface: surfacePalette,
                primary: {
                    color: "{zinc.50}",
                    contrastColor: "{zinc.950}",
                    hoverColor: "{zinc.100}",
                    activeColor: "{zinc.200}",
                },
                highlight: {
                    background: "rgba(250, 250, 250, .16)",
                    focusBackground: "rgba(250, 250, 250, .24)",
                    color: "rgba(255, 255, 255, .87)",
                    focusColor: "rgba(255, 255, 255, .87)",
                },
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

export { surfacePalette, customAuraPreset };
