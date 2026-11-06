import { afterEach, describe, expect, it } from "vitest";
import { mountSuspended } from "@nuxt/test-utils/runtime";
import type { VueWrapper } from "@vue/test-utils";
import ShowHiddenToggle from "./ShowHiddenToggle.vue";

const mounted: VueWrapper[] = [];

const mountToggle = async (modelValue: boolean, variant?: "button" | "pill") => {
    const wrapper = await mountSuspended(ShowHiddenToggle, { props: { modelValue, variant } });
    mounted.push(wrapper);
    return wrapper;
};

const toggleButton = (wrapper: VueWrapper) => wrapper.find('[aria-label="Show hidden transactions"]');

describe("TransactionsShowHiddenToggle", () => {
    afterEach(() => {
        mounted.splice(0).forEach((wrapper) => wrapper.unmount());
    });

    it("is not pressed while hidden transactions are off", async () => {
        const wrapper = await mountToggle(false);

        expect(toggleButton(wrapper).attributes("aria-pressed")).toBe("false");
    });

    it("is pressed while hidden transactions are shown", async () => {
        const wrapper = await mountToggle(true);

        expect(toggleButton(wrapper).attributes("aria-pressed")).toBe("true");
    });

    it("is outlined while off in the desktop toolbar", async () => {
        const wrapper = await mountToggle(false);

        expect(toggleButton(wrapper).classes()).toContain("p-button-outlined");
        expect(toggleButton(wrapper).classes()).not.toContain("rounded-full");
    });

    it("is a filled, rounded pill in the mobile chip row, never outlined", async () => {
        const off = await mountToggle(false, "pill");
        expect(toggleButton(off).classes()).not.toContain("p-button-outlined");
        expect(toggleButton(off).classes()).toContain("rounded-full");

        const on = await mountToggle(true, "pill");
        expect(toggleButton(on).classes()).not.toContain("p-button-outlined");
        expect(toggleButton(on).classes()).toContain("rounded-full");
    });

    it("toggles the model on click", async () => {
        const wrapper = await mountToggle(false);

        await toggleButton(wrapper).trigger("click");

        expect(wrapper.emitted("update:modelValue")?.at(-1)).toEqual([true]);
    });
});
