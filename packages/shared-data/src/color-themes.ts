// Only themes the web app ships. Adding a theme = a name here + its definition in apps/web/app/theme/themes.ts.
export const COLOR_THEMES = ["noir", "ocean", "forest", "sunset", "rose"] as const;
export type ColorThemeName = (typeof COLOR_THEMES)[number];
export const DEFAULT_COLOR_THEME: ColorThemeName = "noir";

export function isColorThemeName(value: unknown): value is ColorThemeName {
    return typeof value === "string" && (COLOR_THEMES as readonly string[]).includes(value);
}

/** Narrows a stored value; anything unknown (e.g. a removed theme) reads as null = default. */
export function parseColorTheme(raw: string | null | undefined): ColorThemeName | null {
    return isColorThemeName(raw) ? raw : null;
}
