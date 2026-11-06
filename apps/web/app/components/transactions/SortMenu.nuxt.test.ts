import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockNuxtImport, mountSuspended } from "@nuxt/test-utils/runtime";
import { flushPromises } from "@vue/test-utils";
import { ref } from "vue";
import SortMenu from "./SortMenu.vue";
import type { TransactionSortOption } from "../../composables/transactions/useTransactionFilters";

// Toggled per test to cover the md+ popup Menu and the below-md sheet.
const desktop = ref(true);

mockNuxtImport("useIsDesktop", () => () => desktop);

// Both containers teleport to <body>, so every mounted menu is unmounted after its test.
const mounted: { unmount: () => void }[] = [];

const mountSortMenu = async (props: { modelValue?: TransactionSortOption; compact?: boolean } = {}) => {
    // Real transitions are stubbed out so the sheet and menu unmount as soon as they close.
    const wrapper = await mountSuspended(SortMenu, { props, global: { stubs: { transition: false } } });
    mounted.push(wrapper);
    return wrapper;
};

const trigger = (wrapper: Awaited<ReturnType<typeof mountSortMenu>>) => wrapper.find("[aria-haspopup]");

// The sheet teleports to <body>, so it is read from the document.
const sheet = () => document.body.querySelector<HTMLElement>("[data-bottom-sheet]");

const sheetButton = (text: string) => {
    const element = [...(sheet()?.querySelectorAll("button") ?? [])].find(
        (candidate) => candidate.textContent?.trim() === text,
    );
    if (!element) throw new Error(`no sheet button labelled ${text}`);
    return element;
};

describe("SortMenu", () => {
    beforeEach(() => {
        desktop.value = true;
    });

    afterEach(() => {
        mounted.splice(0).forEach((wrapper) => wrapper.unmount());
    });

    it("shows the full prefixed label and no aria-label by default", async () => {
        const wrapper = await mountSortMenu({ modelValue: "newest" });

        expect(trigger(wrapper).text()).toContain("Sort · Newest");
        expect(trigger(wrapper).attributes("aria-label")).toBeUndefined();
    });

    it("drops the prefix when compact and names the trigger with the full sort label", async () => {
        const wrapper = await mountSortMenu({ modelValue: "newest", compact: true });

        expect(trigger(wrapper).text()).toContain("Newest");
        expect(trigger(wrapper).text()).not.toContain("Sort");
        expect(trigger(wrapper).attributes("aria-label")).toBe("Sort: Newest first");
    });

    it("shows the short value and the matching full label for a non-default sort when compact", async () => {
        const wrapper = await mountSortMenu({ modelValue: "amount-desc", compact: true });

        expect(trigger(wrapper).text()).toContain("Highest");
        expect(trigger(wrapper).text()).not.toContain("Sort");
        expect(trigger(wrapper).attributes("aria-label")).toBe("Sort: Highest amount");
    });

    it("opens the popup Menu at md and up, not a sheet", async () => {
        const wrapper = await mountSortMenu({ modelValue: "newest" });

        expect(trigger(wrapper).attributes("aria-haspopup")).toBe("menu");

        await trigger(wrapper).trigger("click");
        await flushPromises();

        expect(document.body.querySelector('[role="menu"]')).not.toBeNull();
        expect(sheet()).toBeNull();
    });
});

describe("SortMenu below md", () => {
    beforeEach(() => {
        desktop.value = false;
    });

    afterEach(() => {
        mounted.splice(0).forEach((wrapper) => wrapper.unmount());
    });

    it("opens a Sort by sheet from the trigger instead of the menu", async () => {
        const wrapper = await mountSortMenu({ modelValue: "newest" });

        expect(trigger(wrapper).attributes("aria-haspopup")).toBe("dialog");
        expect(trigger(wrapper).attributes("aria-expanded")).toBe("false");

        await trigger(wrapper).trigger("click");
        await flushPromises();

        expect(sheet()?.getAttribute("aria-label")).toBe("Sort by");
        expect(sheet()?.querySelector('[role="radiogroup"]')).not.toBeNull();
        expect(trigger(wrapper).attributes("aria-expanded")).toBe("true");
        expect(document.body.querySelector('[role="menu"]')).toBeNull();
    });

    it("lists every option as a radio and marks the current one checked", async () => {
        const wrapper = await mountSortMenu({ modelValue: "oldest" });
        await trigger(wrapper).trigger("click");
        await flushPromises();

        const radios = [...(sheet()?.querySelectorAll('[role="radio"]') ?? [])];
        expect(radios.map((radio) => radio.textContent?.trim())).toEqual([
            "Newest first",
            "Oldest first",
            "Highest amount",
            "Lowest amount",
            "Name (A–Z)",
        ]);
        expect(sheetButton("Oldest first").getAttribute("aria-checked")).toBe("true");
        expect(sheetButton("Newest first").getAttribute("aria-checked")).toBe("false");
    });

    it("picking Oldest first emits oldest and closes the sheet", async () => {
        const wrapper = await mountSortMenu({ modelValue: "newest" });
        await trigger(wrapper).trigger("click");
        await flushPromises();

        sheetButton("Oldest first").click();
        await flushPromises();

        expect(wrapper.emitted("update:modelValue")).toEqual([["oldest"]]);
        await vi.waitFor(() => expect(sheet()).toBeNull());
    });

    it("closes the sheet when the layout crosses md, so its mask does not cover the desktop layout", async () => {
        const wrapper = await mountSortMenu({ modelValue: "newest" });
        await trigger(wrapper).trigger("click");
        await flushPromises();
        expect(sheet()).not.toBeNull();

        desktop.value = true;
        await flushPromises();

        await vi.waitFor(() => expect(sheet()).toBeNull());
        expect(wrapper.emitted("update:modelValue")).toBeUndefined();
    });

    it("Done closes the sheet without changing the sort", async () => {
        const wrapper = await mountSortMenu({ modelValue: "newest" });
        await trigger(wrapper).trigger("click");
        await flushPromises();

        sheetButton("Done").click();
        await flushPromises();

        await vi.waitFor(() => expect(sheet()).toBeNull());
        expect(wrapper.emitted("update:modelValue")).toBeUndefined();
    });
});
