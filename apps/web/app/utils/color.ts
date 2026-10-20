/**
 * Normalize a hex color (`#RGB` or `#RRGGBB`) to a lowercase `#rrggbb`
 * string. Trims whitespace, strips a leading `#`, and expands 3-digit
 * shorthand to 6. Returns `null` when the input isn't a parseable hex, so
 * callers can decide on a fallback (e.g. `UNCATEGORIZED_CATEGORY.color`)
 * instead of silently rendering a broken color.
 */
export const normalizeHex = (hex: string | null | undefined): string | null => {
    let value = (hex ?? "").trim().replace(/^#/, "");
    if (value.length === 3) {
        value = value
            .split("")
            .map((char) => char + char)
            .join("");
    }
    if (value.length !== 6 || /[^0-9a-fA-F]/.test(value)) {
        return null;
    }
    return `#${value.toLowerCase()}`;
};

/**
 * Convert a hex color (`#RGB` or `#RRGGBB`) to an `rgba()` string at the
 * given alpha. Callers are responsible for passing an already-validated
 * color (see `normalizeHex`); unparseable input resolves to transparent
 * black rather than emitting a malformed CSS string.
 */
export const hexToRgba = (hex: string, alpha: number): string => {
    const normalized = normalizeHex(hex);
    if (!normalized) {
        return `rgba(0, 0, 0, ${alpha})`;
    }
    const red = parseInt(normalized.slice(1, 3), 16);
    const green = parseInt(normalized.slice(3, 5), 16);
    const blue = parseInt(normalized.slice(5, 7), 16);
    return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
};
