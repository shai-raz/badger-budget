// Pure theme data: no PrimeVue/Aura import, so the store, nuxt.config and utils
// can all read it. `buildPreset` in preset.ts turns a ThemeDefinition into the
// PrimeVue preset.

import type { ColorThemeName } from "@badger/shared-data";
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

// A palette ramp as Aura references: `paletteRamp("blue")` gives `{blue.50}` … `{blue.950}`.
export function paletteRamp(palette: string): Record<PrimaryStep, string> {
    const at = (step: PrimaryStep) => `{${palette}.${step}}`;
    return {
        50: at(50),
        100: at(100),
        200: at(200),
        300: at(300),
        400: at(400),
        500: at(500),
        600: at(600),
        700: at(700),
        800: at(800),
        900: at(900),
        950: at(950),
    };
}

// Light scheme on a tinted primary: primary at 700, highlights tinted from the 50-900 steps.
export function tintedLight(amount: SchemeMapping["amount"] = DEFAULT_AMOUNT): SchemeMapping {
    return {
        primary: {
            color: "{primary.700}",
            contrastColor: "#ffffff",
            hoverColor: "{primary.800}",
            activeColor: "{primary.900}",
        },
        highlight: {
            background: "{primary.50}",
            focusBackground: "{primary.100}",
            color: "{primary.800}",
            focusColor: "{primary.900}",
        },
        amount,
    };
}

// Dark scheme on a tinted primary: the 400 step on the surface. `rgb400` is the same
// colour as `{primary.400}`, as "r, g, b", so the translucent highlights can use it.
export function tintedDark(
    rgb400: string,
    onPrimary: string,
    amount: SchemeMapping["amount"] = DEFAULT_AMOUNT,
): SchemeMapping {
    return {
        primary: {
            color: "{primary.400}",
            contrastColor: onPrimary,
            hoverColor: "{primary.300}",
            activeColor: "{primary.200}",
        },
        highlight: {
            background: `rgba(${rgb400}, .16)`,
            focusBackground: `rgba(${rgb400}, .24)`,
            color: "{primary.300}",
            focusColor: "{primary.200}",
        },
        amount,
    };
}

export const oceanTheme: ThemeDefinition = {
    label: "Ocean",
    primary: paletteRamp("blue"),
    surface: {
        0: "#FFFFFF",
        50: "#F5F8FC",
        100: "#EDF2F8",
        200: "#DCE4EE",
        300: "#C3CFDD",
        400: "#94A3B8",
        // Muted text on the page must pass 4.5:1; #64748B gives only 4.47:1 here.
        500: "#617089",
        600: "#475569",
        700: "#334155",
        800: "#1A2433",
        900: "#0F1724",
        950: "#0A0F18",
    },
    light: tintedLight(),
    dark: tintedDark("96, 165, 250", "#0A0F18"),
};

export const THEMES: Record<ColorThemeName, ThemeDefinition> = {
    noir: noirTheme,
    ocean: oceanTheme,
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
