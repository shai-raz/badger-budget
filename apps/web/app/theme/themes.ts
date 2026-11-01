// Pure theme data: no PrimeVue/Aura import, so the store, nuxt.config and utils
// can all read it. `buildPreset` in preset.ts turns a ThemeDefinition into the
// PrimeVue preset.

import type { ColorMode } from "../utils/theme";

export type PrimaryStep = 50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 | 950;
export type SurfaceStep = 0 | PrimaryStep;

export interface SchemeMapping {
    primary: { color: string; contrastColor: string; hoverColor: string; activeColor: string };
    highlight: { background: string; focusBackground: string; color: string; focusColor: string };
    amount: { income: string; incomeStrong: string; expense: string };
}

export interface ThemeDefinition {
    label: string;
    primary: Record<PrimaryStep, string>;
    surface: Record<SurfaceStep, string>;
    light: SchemeMapping;
    dark: SchemeMapping;
}

// Amount colours reference the Aura palette so they follow the theme's ramps.
export const DEFAULT_AMOUNT = {
    income: "{teal.500}",
    incomeStrong: "{teal.600}",
    expense: "{rose.500}",
} as const;

// Budget fills are status colours: same in every theme.
export const BUDGET_LEVEL_TOKENS = {
    ok: "#10b981",
    warning: "#f59e0b",
    over: "#ef4444",
} as const;

// Charcoal surface palette shared by both color schemes.
// PrimeVue v4 only reads surfaces from `semantic.colorScheme.{light,dark}.surface`
// (NOT from `semantic.surface`), so buildPreset injects it into each scheme.
// Light mode keeps a subtle light-gray look; dark mode uses the deep charcoal end
// (#1F2022 / #111111) instead of Aura's default zinc.
const noirSurface = {
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
} as const satisfies Record<SurfaceStep, string>;

export const noirTheme: ThemeDefinition = {
    label: "Noir",
    // Custom Aura preset with black and white base palette
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
    surface: noirSurface,
    light: {
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
        amount: DEFAULT_AMOUNT,
    },
    // Noir-style dark: primary maps to near-white like PrimeVue's Noir preset,
    // because the near-black ramp's default {primary.400} gave ~2.5:1 contrast.
    // The key is `contrastColor` (not `inverseColor`), which Aura components read.
    dark: {
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
        amount: DEFAULT_AMOUNT,
    },
};

// Chart.js draws on a canvas, where CSS var() does not resolve, so chart colours are hex
// read straight from the theme's surface ramp.
export function chartColors(def: ThemeDefinition, mode: ColorMode): { sliceBorder: string; other: string } {
    return {
        // Separates the slices: the card's surface in each mode.
        sliceBorder: mode === "dark" ? def.surface[900] : def.surface[0],
        // The synthetic "Other" slice, which has no category colour of its own.
        other: def.surface[300],
    };
}
