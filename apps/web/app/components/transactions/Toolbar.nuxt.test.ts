import { afterEach, describe, expect, it, vi } from "vitest";
import { mockNuxtImport, mountSuspended } from "@nuxt/test-utils/runtime";
import type { VueWrapper } from "@vue/test-utils";
import { ref } from "vue";
import Toolbar from "./Toolbar.vue";
import { currentMonthSelection } from "~/utils/monthRange";
import type { FilterOption } from "~/utils/filterOptions";

// Toggled per test to cover the md+ and below-md layouts.
const layout = vi.hoisted(() => ({ desktop: true }));

mockNuxtImport("useIsDesktop", () => () => ref(layout.desktop));

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

    it("hides Clear all with one active filter", async () => {
        layout.desktop = true;
        const wrapper = await mountToolbar({ activeFilterCount: 1 });

        expect(buttonByText(wrapper, "Clear all")).toBeUndefined();
    });

    it("shows Clear all with two active filters", async () => {
        layout.desktop = true;
        const wrapper = await mountToolbar({ activeFilterCount: 2 });

        expect(buttonByText(wrapper, "Clear all")).toBeDefined();
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
