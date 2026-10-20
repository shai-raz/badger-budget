import Aura from "@primeuix/themes/aura";
import { describe, expect, it } from "vitest";
import { customAuraPreset, surfacePalette } from "./preset";

type Preset = typeof customAuraPreset;
const semantic = customAuraPreset.semantic as Preset["semantic"];
const lightScheme = semantic.colorScheme.light;
const darkScheme = semantic.colorScheme.dark;
const buttonScheme = customAuraPreset.components.button.colorScheme;

describe("customAuraPreset: light scheme", () => {
    it("keeps Aura's primary and highlight tokens", () => {
        expect(lightScheme.primary).toEqual(Aura.semantic?.colorScheme?.light?.primary);
        expect(lightScheme.highlight).toEqual(Aura.semantic?.colorScheme?.light?.highlight);
    });

    it("keeps the custom black/white semantic primary ramp", () => {
        expect(semantic.primary).toEqual({
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
        });
    });

    it("uses the shared surface palette", () => {
        expect(lightScheme.surface).toBe(surfacePalette);
    });
});

describe("customAuraPreset: dark scheme", () => {
    it("uses the surface palette", () => {
        expect(darkScheme.surface).toBe(surfacePalette);
    });

    it("maps primary to near-white with near-black contrast text", () => {
        expect(darkScheme.primary).toEqual({
            color: "{zinc.50}",
            contrastColor: "{zinc.950}",
            hoverColor: "{zinc.100}",
            activeColor: "{zinc.200}",
        });
        expect(darkScheme.primary).not.toHaveProperty("inverseColor");
    });

    it("sets visible highlight backgrounds", () => {
        expect(darkScheme.highlight.background).toBe("rgba(250, 250, 250, .16)");
        expect(darkScheme.highlight.focusBackground).toBe("rgba(250, 250, 250, .24)");
        expect(darkScheme.highlight.color).toBe("rgba(255, 255, 255, .87)");
        expect(darkScheme.highlight.focusColor).toBe("rgba(255, 255, 255, .87)");
    });
});

describe("customAuraPreset: button overrides", () => {
    it("keeps Aura's light button colour scheme", () => {
        expect(buttonScheme.light).toEqual(Aura.components?.button?.colorScheme?.light);
    });

    it("gives dark outlined primary a visible border", () => {
        expect(buttonScheme.dark.outlined.primary.borderColor).toBe("{surface.500}");
        expect(buttonScheme.dark.outlined.primary.color).toBe(
            Aura.components?.button?.colorScheme?.dark?.outlined?.primary?.color,
        );
    });
});

describe("customAuraPreset: components moved over losslessly", () => {
    it("keeps the flat card shadow", () => {
        expect(customAuraPreset.components.card.root.shadow).toBe("none");
    });

    it("keeps the dialog header and content paddings", () => {
        expect(customAuraPreset.components.dialog.header.padding).toBe("1.25rem 1.25rem 1rem");
        expect(customAuraPreset.components.dialog.content.padding).toBe("0.25rem 1.25rem 1.25rem 1.25rem");
    });
});
