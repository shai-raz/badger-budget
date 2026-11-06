import { afterEach, describe, expect, it } from "vitest";
import { mountSuspended } from "@nuxt/test-utils/runtime";
import type { VueWrapper } from "@vue/test-utils";
import FiltersButton from "./FiltersButton.vue";

const mounted: VueWrapper[] = [];

const mountButton = async (count: number, expanded = false) => {
    const wrapper = await mountSuspended(FiltersButton, { props: { count, expanded } });
    mounted.push(wrapper);
    return wrapper;
};

describe("TransactionsFiltersButton", () => {
    afterEach(() => {
        mounted.splice(0).forEach((wrapper) => wrapper.unmount());
    });

    it("is an icon-only 36px square with no badge when no drawer filter is active", async () => {
        const wrapper = await mountButton(0);

        const button = wrapper.find('[aria-label="Filters"]');
        expect(button.exists()).toBe(true);
        expect(button.text()).toBe("");
        expect(wrapper.find(".p-badge").exists()).toBe(false);
        expect(button.classes()).toContain("h-9");
        expect(button.classes()).toContain("w-9");
    });

    it("shows the count in an info badge and drops the square width", async () => {
        const wrapper = await mountButton(2);

        const button = wrapper.find('[aria-label="Filters, 2 active"]');
        expect(button.exists()).toBe(true);
        const badge = button.find(".p-badge");
        expect(badge.classes()).toContain("p-badge-info");
        expect(badge.text()).toBe("2");
        expect(button.classes()).toContain("h-9");
        expect(button.classes()).not.toContain("w-9");
    });

    it("reflects the expanded state in aria-expanded", async () => {
        const closed = await mountButton(0, false);
        expect(closed.find('[aria-label="Filters"]').attributes("aria-expanded")).toBe("false");

        const open = await mountButton(0, true);
        expect(open.find('[aria-label="Filters"]').attributes("aria-expanded")).toBe("true");
    });

    it("emits click when pressed", async () => {
        const wrapper = await mountButton(0);

        await wrapper.find('[aria-label="Filters"]').trigger("click");

        expect(wrapper.emitted("click")).toHaveLength(1);
    });
});
