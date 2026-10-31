import Aura from "@primeuix/themes/aura";
import { describe, expect, it } from "vitest";
import { resolveColor, themeSwatch } from "./resolve";
import { noirTheme, oceanTheme } from "./themes";

const primitive = Aura.primitive ?? {};

describe("resolveColor", () => {
    it("resolves a palette reference through Aura's primitives", () => {
        expect(resolveColor("{blue.500}", oceanTheme)).toBe(primitive.blue?.[500]);
    });

    it("resolves a primary reference through the theme's primary ramp, recursively", () => {
        expect(resolveColor("{primary.700}", noirTheme)).toBe("#141414");
        expect(resolveColor("{primary.500}", oceanTheme)).toBe(primitive.blue?.[500]);
    });

    it("resolves a surface reference through the theme's surface", () => {
        expect(resolveColor("{surface.500}", oceanTheme)).toBe("#617089");
    });

    it("passes hex and rgba values through", () => {
        expect(resolveColor("#FFFFFF", oceanTheme)).toBe("#FFFFFF");
        expect(resolveColor("rgba(96, 165, 250, .16)", oceanTheme)).toBe("rgba(96, 165, 250, .16)");
    });

    it("throws on an unknown reference", () => {
        expect(() => resolveColor("{nope.500}", oceanTheme)).toThrow();
        expect(() => resolveColor("{surface.42}", oceanTheme)).toThrow();
        expect(() => resolveColor("{primary.42}", oceanTheme)).toThrow();
    });
});

describe("themeSwatch", () => {
    // The swatch states the text and muted colours by their own steps. These checks tie
    // those steps to Aura's semantic text tokens, so the two can't drift apart.
    it.each(["light", "dark"] as const)("maps text and muted to Aura's text tokens in %s mode", (mode) => {
        const swatch = themeSwatch(oceanTheme, mode);
        const text = Aura.semantic?.colorScheme?.[mode]?.text;
        expect(text?.color).toBeDefined();
        expect(text?.mutedColor).toBeDefined();
        expect(swatch.text).toBe(resolveColor(String(text?.color), oceanTheme));
        expect(swatch.muted).toBe(resolveColor(String(text?.mutedColor), oceanTheme));
    });

    it("resolves the primary and amount colours to hex", () => {
        const swatch = themeSwatch(noirTheme, "dark");
        expect(swatch.primary).toBe("#fafafa");
        expect(swatch.onPrimary).toBe("#09090b");
        expect(swatch.income).toBe(primitive.teal?.[500]);
        expect(swatch.expense).toBe(primitive.rose?.[500]);
    });
});
