import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mockNuxtImport, mountSuspended } from "@nuxt/test-utils/runtime";
import { flushPromises, type VueWrapper } from "@vue/test-utils";
import { ref } from "vue";
import Toolbar from "./Toolbar.vue";
import { currentMonthSelection, stepRange, type PeriodSelection } from "~/utils/monthRange";
import type { FilterOption } from "~/utils/filterOptions";

// Toggled per test to cover the md+ and below-md layouts. Shared, so a test can cross md while mounted.
const desktop = ref(true);

// The full-toolbar media query. A shared ref, so a test can flip it while the toolbar is mounted.
const fullToolbar = ref(true);

mockNuxtImport("useIsDesktop", () => () => desktop);
mockNuxtImport("useMediaQuery", () => () => fullToolbar);

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
    {
        value: "a2",
        label: "Savings",
        avatar: { kind: "entity", icon: null, color: "#22c55e", fallback: "wallet" },
        count: 2,
        stale: false,
    },
];

const typeOptions: FilterOption<"income" | "expense" | "transfer">[] = [
    { value: "income", label: "Income", avatar: { kind: "type", type: "income" }, count: 3, stale: false },
];

afterEach(() => {
    mounted.splice(0).forEach((wrapper) => wrapper.unmount());
    desktop.value = true;
    fullToolbar.value = true;
});

const mountToolbar = async (
    props: {
        activeFilterCount?: number;
        drawerFilterCount?: number;
        period?: PeriodSelection;
        selectedCategoryIds?: string[];
    } = {},
) => {
    const wrapper = await mountSuspended(Toolbar, {
        props: {
            period: props.period ?? currentMonthSelection(new Date()),
            categoryOptions,
            accountOptions,
            typeOptions,
            selectedCategoryIds: props.selectedCategoryIds ?? [],
            activeFilterCount: props.activeFilterCount ?? 0,
            drawerFilterCount: props.drawerFilterCount ?? 0,
        },
    });
    mounted.push(wrapper);
    return wrapper;
};

const buttonByText = (wrapper: VueWrapper, text: string) => wrapper.findAll("button").find((b) => b.text() === text);

// The drawer teleports to the body, so its controls are read from the document. Matches an option by its aria-label
// and a plain button by its text.
const drawerButton = (text: string) =>
    Array.from(document.body.querySelectorAll<HTMLButtonElement>(".p-drawer button")).find(
        (button) => button.getAttribute("aria-label") === text || button.textContent?.trim() === text,
    );

describe("Toolbar desktop", () => {
    it("has no Filters button, and one picker per filter beside the period", async () => {
        desktop.value = true;
        const wrapper = await mountToolbar();

        expect(wrapper.find('[aria-label="Filters"]').exists()).toBe(false);
        // The period picker plus the categories, accounts and type pickers.
        expect(wrapper.findAll('[aria-haspopup="dialog"]')).toHaveLength(4);
    });

    it("keeps Clear all mounted but hidden with one active filter", async () => {
        desktop.value = true;
        const wrapper = await mountToolbar({ activeFilterCount: 1 });

        const clearAll = buttonByText(wrapper, "Clear all");
        expect(clearAll).toBeDefined();
        expect(clearAll!.classes()).toContain("invisible");
    });

    it("shows Clear all with two active filters", async () => {
        desktop.value = true;
        const wrapper = await mountToolbar({ activeFilterCount: 2 });

        expect(buttonByText(wrapper, "Clear all")!.classes()).not.toContain("invisible");
    });

    it("emits clear-all when Clear all is clicked", async () => {
        desktop.value = true;
        const wrapper = await mountToolbar({ activeFilterCount: 2 });

        await buttonByText(wrapper, "Clear all")!.trigger("click");

        expect(wrapper.emitted("clear-all")).toHaveLength(1);
    });
});

describe("Toolbar below md", () => {
    it("shows the Filters button with the drawer count as an info badge", async () => {
        desktop.value = false;
        const wrapper = await mountToolbar({ drawerFilterCount: 3, activeFilterCount: 4 });

        const filters = wrapper.find('[aria-label="Filters, 3 active"]');
        expect(filters.exists()).toBe(true);
        const badge = filters.find(".p-badge-info");
        expect(badge.exists()).toBe(true);
        expect(badge.text()).toBe("3");
    });

    it("shows a plain Filters button with no count when no drawer filter is active", async () => {
        desktop.value = false;
        const wrapper = await mountToolbar({ drawerFilterCount: 0, activeFilterCount: 1 });

        const filters = wrapper.find('[aria-label="Filters"]');
        expect(filters.exists()).toBe(true);
        expect(filters.text()).toBe("");
        expect(wrapper.find(".p-badge").exists()).toBe(false);
    });

    it("puts the period, one pill per filter and show hidden in the scrolling row", async () => {
        desktop.value = false;
        const wrapper = await mountToolbar({ drawerFilterCount: 1 });

        const row = wrapper.find('[aria-label="Quick filters"]');
        expect(row.exists()).toBe(true);
        // The period picker plus the categories, accounts and type pills.
        expect(row.findAll('[aria-haspopup="dialog"]')).toHaveLength(4);
        expect(row.find('[aria-label="Show hidden transactions"]').exists()).toBe(true);
    });

    it("opens a one-filter sheet from a pill", async () => {
        desktop.value = false;
        const wrapper = await mountToolbar();
        const categories = wrapper
            .find('[aria-label="Quick filters"]')
            .findAll("button")
            .find((b) => b.text() === "Categories");

        await categories!.trigger("click");
        await flushPromises();

        expect(document.body.querySelector("[data-bottom-sheet]")?.getAttribute("aria-label")).toBe("Categories");
    });

    it("shows a selected pill with its name and no clear button", async () => {
        desktop.value = false;
        const wrapper = await mountToolbar({ selectedCategoryIds: ["c1"] });

        const row = wrapper.find('[aria-label="Quick filters"]');
        expect(row.findAll("button").some((b) => b.text() === "Groceries")).toBe(true);
        expect(row.find('[aria-label="Clear categories filter"]').exists()).toBe(false);
    });

    it("has no Clear all", async () => {
        desktop.value = false;
        const wrapper = await mountToolbar({ drawerFilterCount: 1, activeFilterCount: 2 });

        expect(buttonByText(wrapper, "Clear all")).toBeUndefined();
    });

    it("shows the period's × only away from this month", async () => {
        desktop.value = false;
        const wrapper = await mountToolbar();
        expect(wrapper.find('[aria-label="Back to this month"]').exists()).toBe(false);

        const previousMonth = stepRange(currentMonthSelection(new Date()), -1);
        const away = await mountToolbar({ period: previousMonth });

        expect(away.find('[aria-label="Back to this month"]').exists()).toBe(true);
    });
});

describe("Toolbar narrow desktop", () => {
    beforeEach(() => {
        desktop.value = true;
        fullToolbar.value = false;
    });

    it("shows a Filters button whose badge counts the drawer filters, not the period", async () => {
        const wrapper = await mountToolbar({ drawerFilterCount: 1, activeFilterCount: 2 });

        const filters = wrapper.find('[aria-label="Filters, 1 active"]');
        expect(filters.exists()).toBe(true);
        expect(filters.find(".p-badge").text()).toBe("1");
    });

    it("shows a plain Filters button with no badge when no drawer filter is active", async () => {
        const wrapper = await mountToolbar({ drawerFilterCount: 0, activeFilterCount: 1 });

        const filters = wrapper.find('[aria-label="Filters"]');
        expect(filters.exists()).toBe(true);
        expect(filters.text()).toBe("");
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

    it("sends an account picked in the drawer up as the account filter", async () => {
        const wrapper = await mountToolbar({ drawerFilterCount: 1 });
        await wrapper.find('[aria-label="Filters, 1 active"]').trigger("click");
        await flushPromises();

        drawerButton("Chequing, 9 transactions")!.click();
        await flushPromises();

        expect(wrapper.emitted("update:selectedAccountIds")).toEqual([[["a1"]]]);
    });

    it("emits clear-all when Clear all is clicked in the drawer", async () => {
        const wrapper = await mountToolbar({ drawerFilterCount: 1, activeFilterCount: 2 });
        await wrapper.find('[aria-label="Filters, 1 active"]').trigger("click");
        await flushPromises();

        drawerButton("Clear all")!.click();
        await flushPromises();

        expect(wrapper.emitted("clear-all")).toHaveLength(1);
    });

    it("closes the drawer when the layout crosses the full-toolbar width", async () => {
        const wrapper = await mountToolbar({ drawerFilterCount: 1 });
        await wrapper.find('[aria-label="Filters, 1 active"]').trigger("click");
        await flushPromises();
        expect(wrapper.find('[aria-label="Filters, 1 active"]').attributes("aria-expanded")).toBe("true");

        // Widening past the full-toolbar width unmounts the narrow branch, and narrowing again remounts it.
        fullToolbar.value = true;
        await flushPromises();
        fullToolbar.value = false;
        await flushPromises();

        expect(wrapper.find('[aria-label="Filters, 1 active"]').attributes("aria-expanded")).toBe("false");
        expect(document.body.querySelectorAll(".p-drawer button[aria-expanded]")).toHaveLength(0);
    });

    it("closes the drawer when the layout drops below md and comes back", async () => {
        const wrapper = await mountToolbar({ drawerFilterCount: 1 });
        await wrapper.find('[aria-label="Filters, 1 active"]').trigger("click");
        await flushPromises();

        // Below md the narrow branch unmounts with its drawer, so widening back remounts it. It must come back closed.
        desktop.value = false;
        await flushPromises();
        desktop.value = true;
        await flushPromises();

        expect(wrapper.find('[aria-label="Filters, 1 active"]').attributes("aria-expanded")).toBe("false");
        expect(document.body.querySelectorAll(".p-drawer button[aria-expanded]")).toHaveLength(0);
    });
});
