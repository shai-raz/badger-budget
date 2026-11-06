import { afterEach, describe, expect, it } from "vitest";
import { mockNuxtImport, mountSuspended } from "@nuxt/test-utils/runtime";
import { flushPromises, type DOMWrapper, type VueWrapper } from "@vue/test-utils";
import { ref } from "vue";
import Toolbar from "./Toolbar.vue";
import { currentMonthSelection, stepRange, type PeriodSelection } from "~/utils/monthRange";
import type { FilterOption } from "~/utils/filterOptions";

// Toggled per test to cover the md+ and below-md layouts. Shared, so a test can cross md while mounted.
const desktop = ref(true);

mockNuxtImport("useIsDesktop", () => () => desktop);

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

// The drawer teleports to the body, so its controls are read from the document. Matches an option by its checkbox's
// aria-label and a plain button by its text.
const drawerButton = (text: string) =>
    Array.from(document.body.querySelectorAll<HTMLElement>(".p-drawer button, .p-drawer input")).find(
        (element) => element.getAttribute("aria-label") === text || element.textContent?.trim() === text,
    );

describe("Toolbar desktop", () => {
    it("shows an icon-only Filters button from md up, with no Filters text", async () => {
        desktop.value = true;
        const wrapper = await mountToolbar();

        const filters = wrapper.find('[aria-label="Filters"]');
        expect(filters.exists()).toBe(true);
        expect(filters.text()).toBe("");
        expect(wrapper.findAll("button").some((b) => b.text() === "Filters")).toBe(false);
    });

    it("shows a Filters badge that counts the drawer filters, not the period", async () => {
        const wrapper = await mountToolbar({ drawerFilterCount: 1, activeFilterCount: 2 });

        expect(wrapper.find(".p-overlaybadge .p-badge").text()).toBe("1");
        expect(wrapper.find('.p-overlaybadge [aria-label="Filters, 1 active"]').exists()).toBe(true);
    });

    it("draws the badge ring in the page colour, since the desktop toolbar sits on the page scroller", async () => {
        desktop.value = true;
        const wrapper = await mountToolbar({ drawerFilterCount: 1 });

        expect(wrapper.find(".p-overlaybadge .p-badge").classes()).toContain("outline-surface-50");
        expect(wrapper.find(".p-overlaybadge .p-badge").classes()).toContain("dark:outline-surface-950");
    });

    it("puts a divider between the Filters button and the quick filters row", async () => {
        for (const drawerFilterCount of [0, 2]) {
            desktop.value = true;
            const wrapper = await mountToolbar({ drawerFilterCount });

            const rowRoot = wrapper.find('[aria-label="Quick filters"]').element.parentElement!;
            const divider = rowRoot.previousElementSibling!;
            expect(divider.getAttribute("aria-hidden")).toBe("true");
            for (const className of ["h-5", "w-px", "shrink-0"]) {
                expect(divider.classList).toContain(className);
            }

            const filtersButton = divider.previousElementSibling!;
            expect(
                filtersButton.matches('[aria-label^="Filters"]') ||
                    filtersButton.querySelector('[aria-label^="Filters"]') !== null,
            ).toBe(true);

            wrapper.unmount();
            mounted.splice(mounted.indexOf(wrapper), 1);
        }
    });

    it("holds the period, the three pickers, Show hidden and Clear all in the quick filters row, with the search outside it", async () => {
        const wrapper = await mountToolbar({ activeFilterCount: 2 });

        const row = wrapper.find('[aria-label="Quick filters"]');
        expect(row.exists()).toBe(true);
        // The period picker plus the categories, accounts and type pickers.
        expect(row.findAll('[aria-haspopup="dialog"]')).toHaveLength(4);
        expect(row.find('[aria-label="Show hidden transactions"]').exists()).toBe(true);
        expect(row.findAll("button").some((b) => b.text() === "Clear all")).toBe(true);
        expect(row.find('input[placeholder="Search transactions"]').exists()).toBe(false);
        expect(wrapper.find('input[placeholder="Search transactions"]').exists()).toBe(true);
    });

    it("gives the search box and Clear all the 36px height", async () => {
        const wrapper = await mountToolbar({ activeFilterCount: 2 });

        expect(wrapper.find('input[placeholder="Search transactions"]').classes()).toContain("h-9");
        expect(buttonByText(wrapper, "Clear all")!.classes()).toContain("h-9");
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

    it("closes the drawer when the layout drops below md and comes back", async () => {
        const wrapper = await mountToolbar({ drawerFilterCount: 1 });
        await wrapper.find('[aria-label="Filters, 1 active"]').trigger("click");
        await flushPromises();

        // Below md the desktop branch unmounts with its drawer, so widening back remounts it. It must come back closed.
        desktop.value = false;
        await flushPromises();
        desktop.value = true;
        await flushPromises();

        expect(wrapper.find('[aria-label="Filters, 1 active"]').attributes("aria-expanded")).toBe("false");
        expect(document.body.querySelectorAll(".p-drawer button[aria-expanded]")).toHaveLength(0);
    });
});

describe("Toolbar below md", () => {
    it("shows the Filters button with the drawer count as a corner info badge", async () => {
        desktop.value = false;
        const wrapper = await mountToolbar({ drawerFilterCount: 3, activeFilterCount: 4 });

        const badge = wrapper.find(".p-overlaybadge .p-badge-info");
        expect(badge.exists()).toBe(true);
        expect(badge.text()).toBe("3");
        expect(wrapper.find('.p-overlaybadge [aria-label="Filters, 3 active"]').exists()).toBe(true);
    });

    it("keeps the theme's header ring on the mobile badge", async () => {
        desktop.value = false;
        const wrapper = await mountToolbar({ drawerFilterCount: 3, activeFilterCount: 4 });

        expect(wrapper.find(".p-overlaybadge .p-badge").classes()).not.toContain("outline-surface-50");
    });

    it("shows a plain Filters button with no count when no drawer filter is active", async () => {
        desktop.value = false;
        const wrapper = await mountToolbar({ drawerFilterCount: 0, activeFilterCount: 1 });

        const filters = wrapper.find('[aria-label="Filters"]');
        expect(filters.exists()).toBe(true);
        expect(filters.text()).toBe("");
        expect(wrapper.find(".p-overlaybadge").exists()).toBe(false);
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

    it("gives the Filters button, period label, pills and Show hidden pill the 36px height", async () => {
        desktop.value = false;
        const wrapper = await mountToolbar({ drawerFilterCount: 1 });

        const row = wrapper.find('[aria-label="Quick filters"]');
        const controls: DOMWrapper<Element>[] = [
            wrapper.find('[aria-label="Filters, 1 active"]'),
            // The first dialog trigger is the period label; the rest are the category, account and type pills.
            ...row.findAll('[aria-haspopup="dialog"]'),
            row.find('[aria-label="Show hidden transactions"]'),
        ];
        for (const control of controls) {
            expect(control.classes()).toContain("h-9");
        }
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

    it("shows a selected pill with its name and a clear button", async () => {
        desktop.value = false;
        const wrapper = await mountToolbar({ selectedCategoryIds: ["c1"] });

        const row = wrapper.find('[aria-label="Quick filters"]');
        expect(row.findAll("button").some((b) => b.text() === "Groceries")).toBe(true);
        expect(row.find('[aria-label="Clear categories filter"]').exists()).toBe(true);
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
