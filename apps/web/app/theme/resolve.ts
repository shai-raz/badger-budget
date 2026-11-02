import Aura from "@primeuix/themes/aura";
import type { ColorMode } from "../utils/theme";
import type { PrimaryStep, SurfaceStep, ThemeDefinition } from "./themes";

const REFERENCE = /^\{([a-zA-Z]+)\.(\d+)\}$/;
const PRIMARY_STEPS: readonly PrimaryStep[] = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
const SURFACE_STEPS: readonly SurfaceStep[] = [0, ...PRIMARY_STEPS];
const primitives: Record<string, Record<string, string> | undefined> = { ...Aura.primitive };

function isPrimaryStep(step: number): step is PrimaryStep {
    return PRIMARY_STEPS.some((known) => known === step);
}

function isSurfaceStep(step: number): step is SurfaceStep {
    return SURFACE_STEPS.some((known) => known === step);
}

// Turns a theme value into a concrete colour: `{primary.N}` and `{surface.N}` read the
// theme, `{palette.N}` reads Aura's primitives, and hex or rgba pass through unchanged.
export function resolveColor(value: string, def: ThemeDefinition): string {
    const match = REFERENCE.exec(value);
    if (!match) {
        return value;
    }
    const [, name = "", stepText = ""] = match;
    const step = Number(stepText);
    if (name === "primary" && isPrimaryStep(step)) {
        return resolveColor(def.primary[step], def);
    }
    if (name === "surface" && isSurfaceStep(step)) {
        return def.surface[step];
    }
    const hex = primitives[name]?.[stepText];
    if (hex === undefined) {
        throw new Error(`Unknown colour reference "${value}"`);
    }
    return hex;
}

export interface ThemeSwatch {
    page: string;
    card: string;
    border: string;
    text: string;
    muted: string;
    primary: string;
    onPrimary: string;
    income: string;
    incomeStrong: string;
    expense: string;
}

// The colours a theme shows in one mode, as hex. Used by the picker tiles, which
// show other themes and so cannot read CSS variables, and by the contrast test.
export function themeSwatch(def: ThemeDefinition, mode: ColorMode): ThemeSwatch {
    const scheme = def[mode];
    const resolve = (value: string) => resolveColor(value, def);
    const dark = mode === "dark";
    return {
        page: def.surface[dark ? 950 : 50],
        card: def.surface[dark ? 900 : 0],
        border: def.surface[dark ? 700 : 200],
        text: def.surface[dark ? 0 : 700],
        muted: def.surface[dark ? 400 : 500],
        primary: resolve(scheme.primary.color),
        onPrimary: resolve(scheme.primary.contrastColor),
        income: resolve(scheme.amount.income),
        incomeStrong: resolve(scheme.amount.incomeStrong),
        expense: resolve(scheme.amount.expense),
    };
}
