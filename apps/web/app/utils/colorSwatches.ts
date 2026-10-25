import { NEW_CATEGORY_PALETTE } from "~/utils/pendingCategory";

/** The palette entry a colour equals (case and leading '#' ignored), or null for a custom colour. */
export function paletteSwatchFor(color: string | null | undefined): string | null {
    const normalised = (color ?? "").trim().toUpperCase();
    if (!normalised) return null;
    const hex = normalised.startsWith("#") ? normalised : `#${normalised}`;
    return NEW_CATEGORY_PALETTE.find((swatch) => swatch === hex) ?? null;
}
