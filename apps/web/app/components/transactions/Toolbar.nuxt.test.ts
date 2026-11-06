import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockNuxtImport, mountSuspended } from "@nuxt/test-utils/runtime";
import { flushPromises, type VueWrapper } from "@vue/test-utils";
import { ref } from "vue";
import Toolbar from "./Toolbar.vue";
import { currentMonthSelection } from "~/utils/monthRange";
import type { FilterOption } from "~/utils/filterOptions";

// Toggled per test to cover the md+ and below-md layouts.
const layout = vi.hoisted(() => ({ desktop: true, full: true }));

mockNuxtImport("useIsDesktop", () => () => ref(layout.desktop));
mockNuxtImport("useMediaQuery", () => () => ref(layout.full));

const mounted: VueWrapper[] = [];

const categoryOptions: FilterOption[] = [
    {
        value: "c1",
        label: "Groceries",
        avatar: { kind: "entity", icon: null, color: "#22c55e", fallback: "tag" },
        count: 4,
        stale: false,
    },
];

const accountOptions: FilterOption[] = [
    {
        value: "a1",
        label: "Chequing",
        avatar: { kind: "entity", icon: null, color: "#3b82f6", fallback: "wallet" },
        count: 9,
        stale: false,
    },
];

const typeOptions: FilterOption<"income" | "expense" | "transfer">[] = [
    { value: "income", label: "Income", avatar: { kind: "type", type: "income" }, count: 3, stale: false },
];

afterEach(() => {
    mounted.splice(0).forEach((wrapper) => wrapper.unmount());
    layout.full = true;
});

const mountToolbar = async (props: { activeFilterCount?: number; drawerFilterCount?: number } = {}) => {
    const wrapper = await mountSuspended(Toolbar, {
        props: {
            period: currentMonthSelection(new Date()),
            categoryOptions,
            accountOptions,
            typeOptions,
            activeFilterCount: props.activeFilterCount ?? 0,
            drawerFilterCount: props.drawerFilterCount ?? 0,
        },
    });
    mounted.push(wrapper);
    return wrapper;
};

const buttonByText = (wrapper: VueWrapper, text: string) => wrapper.findAll("button").find((b) => b.text() === text);

describe("Toolbar desktop", () => {
    it("has no Filters button, and one picker per filter beside the period", async () => {
        layout.desktop = true;
        const wrapper = await mountToolbar();

        expect(wrapper.find('[aria-label="Filters"]').exists()).toBe(false);
        // The period picker plus the categories, accounts and type pickers.
        expect(wrapper.findAll('[aria-haspopup="dialog"]')).toHaveLength(4);
    });

    it("keeps Clear all mounted but hidden with one active filter", async () => {
        layout.desktop = true;
        const wrapper = await mountToolbar({ activeFilterCount: 1 });

        const clearAll = buttonByText(wrapper, "Clear all");
        expect(clearAll).toBeDefined();
        expect(clearAll!.classes()).toContain("invisible");
    });

    it("shows Clear all with two active filters", async () => {
        layout.desktop = true;
        const wrapper = await mountToolbar({ activeFilterCount: 2 });

        expect(buttonByText(wrapper, "Clear all")!.classes()).not.toContain("invisible");
    });

    it("emits clear-all when Clear all is clicked", async () => {
        layout.desktop = true;
        const wrapper = await mountToolbar({ activeFilterCount: 2 });

        await buttonByText(wrapper, "Clear all")!.trigger("click");

        expect(wrapper.emitted("clear-all")).toHaveLength(1);
    });
});

describe("Toolbar below md", () => {
    it("shows the Filters button with the drawer count as its badge", async () => {
        layout.desktop = false;
        const wrapper = await mountToolbar({ drawerFilterCount: 3, activeFilterCount: 4 });

        expect(wrapper.find('[aria-label="Filters"]').exists()).toBe(true);
        expect(wrapper.find(".p-badge").text()).toBe("3");
    });

    it("has no Clear all and no per-filter pickers", async () => {
        layout.desktop = false;
        const wrapper = await mountToolbar({ drawerFilterCount: 1, activeFilterCount: 2 });

        expect(buttonByText(wrapper, "Clear all")).toBeUndefined();
        expect(wrapper.find('[aria-label="Clear categories filter"]').exists()).toBe(false);
    });
});

describe("Toolbar narrow desktop", () => {
    beforeEach(() => {
        layout.desktop = true;
        layout.full = false;
    });

    it("shows a Filters button whose badge counts the drawer filters, not the period", async () => {
        const wrapper = await mountToolbar({ drawerFilterCount: 1, activeFilterCount: 2 });

        const filters = wrapper.find('[aria-label="Filters, 1 active"]');
        expect(filters.exists()).toBe(true);
        expect(filters.find(".p-badge").text()).toBe("1");
    });

    it("shows a plain Filters button with no badge when no drawer filter is active", async () => {
        const wrapper = await mountToolbar({ drawerFilterCount: 0, activeFilterCount: 1 });

        expect(wrapper.find('[aria-label="Filters"]').exists()).toBe(true);
        expect(wrapper.find(".p-badge").exists()).toBe(false);
    });

    it("puts the period and every picker in the scrolling row", async () => {
        const wrapper = await mountToolbar({ drawerFilterCount: 1 });

        const row = wrapper.find('[aria-label="Quick filters"]');
        expect(row.exists()).toBe(true);
        // The period picker plus the categories, accounts and type pickers.
        expect(row.findAll('[aria-haspopup="dialog"]')).toHaveLength(4);
        expect(buttonByText(wrapper, "Clear all")).toBeDefined();
    });

    it("opens the drawer with its sections expanded when Filters is clicked", async () => {
        const wrapper = await mountToolbar({ drawerFilterCount: 1 });
        expect(document.body.querySelectorAll(".p-drawer button[aria-expanded]")).toHaveLength(0);

        await wrapper.find('[aria-label="Filters, 1 active"]').trigger("click");
        await flushPromises();

        // The drawer teleports to the body, so its section headers are read from the document.
        const headers = Array.from(document.body.querySelectorAll(".p-drawer button[aria-expanded]"));
        expect(headers.map((button) => button.getAttribute("aria-expanded"))).toEqual(["true", "true", "true"]);
    });
});
