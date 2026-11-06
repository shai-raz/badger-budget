import { describe, expect, it } from "vitest";
import { mountSuspended } from "@nuxt/test-utils/runtime";
import EntityAvatar from "./EntityAvatar.vue";
import { TRANSACTION_TYPE_AVATARS } from "~/utils/avatarIcons";

describe("EntityAvatar", () => {
    it("tints a hex colour with rgba and draws the glyph in that hex", async () => {
        const wrapper = await mountSuspended(EntityAvatar, {
            props: { icon: "coffee", color: "#10B981", fallback: "tag" },
        });

        expect(wrapper.attributes("style")).toContain("background-color: rgba(16, 185, 129, 0.14)");
        expect(wrapper.attributes("style")).not.toMatch(/(^|;\s*)color:/);
        expect(wrapper.find("svg").attributes("stroke")).toBe("#10b981");
    });

    it("tints a var() token with color-mix and draws the glyph in currentColor", async () => {
        const wrapper = await mountSuspended(EntityAvatar, {
            props: { icon: "coffee", color: "var(--p-amount-income)", fallback: "tag" },
        });

        // happy-dom drops `color-mix()` declarations, so the 14% wash is only checked in the browser; the text colour
        // it sits beside is asserted here.
        expect(wrapper.attributes("style")).toContain("color: var(--p-amount-income)");
        expect(wrapper.find("svg").attributes("stroke")).toBe("currentColor");
    });

    it("falls back to the grey default when the colour is missing", async () => {
        const wrapper = await mountSuspended(EntityAvatar, {
            props: { icon: null, color: null, fallback: "tag" },
        });

        expect(wrapper.attributes("style")).toContain("rgba(107, 114, 128, 0.14)");
        expect(wrapper.find("svg").attributes("stroke")?.toLowerCase()).toBe("#6b7280");
    });

    it("draws the glyph prop in place of the registry icon", async () => {
        const wrapper = await mountSuspended(EntityAvatar, {
            props: { glyph: TRANSACTION_TYPE_AVATARS.income.icon, icon: "coffee", color: null, fallback: "tag" },
        });

        expect(wrapper.findComponent(TRANSACTION_TYPE_AVATARS.income.icon).exists()).toBe(true);
    });
});
