import { describe, expect, it } from "vitest";
import { mountSuspended } from "@nuxt/test-utils/runtime";
import ColorThemeTile from "./ColorThemeTile.vue";

describe("SettingsColorThemeTile", () => {
    it("is a radio, out of the tab order when unchecked", async () => {
        const wrapper = await mountSuspended(ColorThemeTile, { props: { name: "ocean", checked: false } });
        const radio = wrapper.get('[role="radio"]');

        expect(radio.attributes("aria-checked")).toBe("false");
        expect(radio.attributes("tabindex")).toBe("-1");
        expect(radio.text()).toContain("Ocean");
        expect(wrapper.find(".pi-check").exists()).toBe(false);
    });

    it("marks the checked theme with a check badge and the roving tab stop", async () => {
        const wrapper = await mountSuspended(ColorThemeTile, { props: { name: "noir", checked: true } });
        const radio = wrapper.get('[role="radio"]');

        expect(radio.attributes("aria-checked")).toBe("true");
        expect(radio.attributes("tabindex")).toBe("0");
        expect(wrapper.find(".pi-check").exists()).toBe(true);
    });

    it("emits select when clicked", async () => {
        const wrapper = await mountSuspended(ColorThemeTile, { props: { name: "ocean", checked: false } });

        await wrapper.get('[role="radio"]').trigger("click");

        expect(wrapper.emitted("select")).toHaveLength(1);
    });
});
