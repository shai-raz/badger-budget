import { normalizeHex } from "./color";

// WCAG 2.x relative luminance of a #RRGGBB colour.
export function relativeLuminance(hex: string): number {
    const normalized = normalizeHex(hex);
    if (!normalized) {
        throw new Error(`Not a hex colour: "${hex}"`);
    }
    const linear = (offset: number) => {
        const channel = parseInt(normalized.slice(offset, offset + 2), 16) / 255;
        return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * linear(1) + 0.7152 * linear(3) + 0.0722 * linear(5);
}

// WCAG 2.x contrast ratio between two colours, from 1 (identical) to 21 (black on white).
export function contrastRatio(a: string, b: string): number {
    const first = relativeLuminance(a);
    const second = relativeLuminance(b);
    return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}
