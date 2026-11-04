import { afterEach, describe, expect, it } from "vitest";
import { mountSuspended } from "@nuxt/test-utils/runtime";
import type { VueWrapper } from "@vue/test-utils";
import FiltersPanel from "./FiltersPanel.vue";
import type { CategoryFilterOption } from "~/utils/categoryFilterOptions";

const options: CategoryFilterOption[] = [
    { value: "uncategorized", label: "Uncategorized", color: "#9CA3AF", count: 2, stale: false },
    { value: "c1", label: "Groceries", color: "#22c55e", count: 14, stale: false },
    { value: "c2", label: "Travel", color: "#3b82f6", count: 0, stale: true },
    { value: "c3", label: "Rent", color: "#f97316", count: 1, stale: false },
    { value: "c4", label: "Misc", color: "#a855f7", stale: false },
];

const mounted: VueWrapper[] = [];

const mountPanel = async (selectedCategoryIds: string[] = ["c2"]) => {
    const wrapper = await mountSuspended(FiltersPanel, {
        props: {
            categoryOptions: options,
            typeFilter: "all",
            selectedCategoryIds,
            showHidden: false,
        },
    });
    mounted.push(wrapper);
    return wrapper;
};

const chip = (wrapper: VueWrapper, label: string) => {
    const element = wrapper.find(`[aria-label="${label}"]`);
    if (!element.exists()) throw new Error(`no chip labelled ${label}`);
    return element;
};

describe("FiltersPanel category chips", () => {
    afterEach(() => {
        mounted.splice(0).forEach((wrapper) => wrapper.unmount());
    });

    it("names each category chip with its transaction count", async () => {
        const wrapper = await mountPanel();

        expect(chip(wrapper, "Uncategorized, 2 transactions").exists()).toBe(true);
        expect(chip(wrapper, "Groceries, 14 transactions").exists()).toBe(true);
    });

    it("uses the singular for a count of one", async () => {
        const wrapper = await mountPanel();

        expect(chip(wrapper, "Rent, 1 transaction").exists()).toBe(true);
    });

    it("renders the count as visible text beside the label", async () => {
        const wrapper = await mountPanel();

        expect(chip(wrapper, "Groceries, 14 transactions").text()).toContain("Groceries");
        expect(chip(wrapper, "Groceries, 14 transactions").text()).toContain("14");
    });

    it("hides the count from assistive tech so the aria-label carries it", async () => {
        const wrapper = await mountPanel();

        const count = chip(wrapper, "Groceries, 14 transactions").find(".tabular-nums");
        expect(count.attributes("aria-hidden")).toBe("true");
    });

    it("dims only the stale option", async () => {
        const wrapper = await mountPanel();

        expect(chip(wrapper, "Travel, 0 transactions").classes()).toContain("opacity-60");
        expect(chip(wrapper, "Groceries, 14 transactions").classes()).not.toContain("opacity-60");
        expect(chip(wrapper, "Rent, 1 transaction").classes()).not.toContain("opacity-60");
    });

    it("colours the count for the selected state, not the idle one", async () => {
        const wrapper = await mountPanel(["c2"]);

        const selectedCount = chip(wrapper, "Travel, 0 transactions").find(".tabular-nums");
        const idleCount = chip(wrapper, "Groceries, 14 transactions").find(".tabular-nums");
        expect(selectedCount.classes()).toContain("text-surface-700");
        expect(idleCount.classes()).toContain("text-muted-color");
    });

    it("renders no count and labels only the name when the count is unknown", async () => {
        const wrapper = await mountPanel();

        const chipWithoutCount = chip(wrapper, "Misc");
        expect(chipWithoutCount.text()).toBe("Misc");
        expect(chipWithoutCount.find(".tabular-nums").exists()).toBe(false);
    });

    it("emits the selection without a stale option when it is clicked", async () => {
        const wrapper = await mountPanel(["c2"]);

        await chip(wrapper, "Travel, 0 transactions").trigger("click");

        expect(wrapper.emitted("update:selectedCategoryIds")?.at(-1)).toEqual([[]]);
    });
});
