import { afterEach, describe, expect, it } from "vitest";
import { mountSuspended } from "@nuxt/test-utils/runtime";
import type { VueWrapper } from "@vue/test-utils";
import FiltersButton from "./FiltersButton.vue";

const mounted: VueWrapper[] = [];

const mountButton = async (count: number, expanded = false, ringClass = "") => {
    const wrapper = await mountSuspended(FiltersButton, { props: { count, expanded, ringClass } });
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
        expect(wrapper.find(".p-overlaybadge").exists()).toBe(false);
        expect(wrapper.find(".p-badge").exists()).toBe(false);
        expect(button.classes()).toContain("h-9");
        expect(button.classes()).toContain("w-9");
    });

    it("shows the count in a corner info badge and keeps the square", async () => {
        const wrapper = await mountButton(2);

        const overlay = wrapper.find(".p-overlaybadge");
        expect(overlay.exists()).toBe(true);
        expect(overlay.classes()).toContain("flex");
        expect(overlay.classes()).toContain("shrink-0");
        const badge = wrapper.find(".p-overlaybadge .p-badge");
        expect(badge.classes()).toContain("p-badge-info");
        expect(badge.classes()).toContain("rounded-full");
        expect(badge.text()).toBe("2");
        expect(badge.attributes("aria-hidden")).toBe("true");

        const button = wrapper.find('[aria-label="Filters, 2 active"]');
        expect(button.exists()).toBe(true);
        expect(button.find(".p-badge").exists()).toBe(false);
        expect(button.text()).toBe("");
        expect(button.classes()).toContain("h-9");
        expect(button.classes()).toContain("w-9");
    });

    it("puts the caller's ring colour on the badge, and keeps the theme ring by default", async () => {
        const ringed = await mountButton(2, false, "outline-surface-50 dark:outline-surface-950");
        const ringedBadge = ringed.find(".p-overlaybadge .p-badge");
        expect(ringedBadge.classes()).toContain("outline-surface-50");
        expect(ringedBadge.classes()).toContain("dark:outline-surface-950");
        expect(ringedBadge.classes()).toContain("rounded-full");

        const themed = await mountButton(2);
        const themedBadge = themed.find(".p-overlaybadge .p-badge");
        expect(themedBadge.classes()).not.toContain("outline-surface-50");
        expect(themedBadge.classes()).toContain("rounded-full");
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

    it("emits click when pressed with a count, through the wrapped button", async () => {
        const wrapper = await mountButton(2);

        await wrapper.find('[aria-label="Filters, 2 active"]').trigger("click");

        expect(wrapper.emitted("click")).toHaveLength(1);
    });
});
