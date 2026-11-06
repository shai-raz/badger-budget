import { afterEach, describe, expect, it } from "vitest";
import { mountSuspended } from "@nuxt/test-utils/runtime";
import type { VueWrapper } from "@vue/test-utils";
import FilterSections from "./FilterSections.vue";
import type { FilterOption } from "~/utils/filterOptions";
import type { TransactionType } from "@badger/shared-data";

const typeOptions: FilterOption<TransactionType>[] = [
    { value: "income", label: "Income", avatar: { kind: "type", type: "income" }, count: 3, stale: false },
    { value: "expense", label: "Expense", avatar: { kind: "type", type: "expense" }, count: 9, stale: false },
];

const accountOptions: FilterOption[] = [
    {
        value: "a1",
        label: "Checking",
        avatar: { kind: "entity", icon: null, color: "#3b82f6", fallback: "tag" },
        count: 4,
        stale: false,
    },
    {
        value: "a2",
        label: "Savings",
        avatar: { kind: "entity", icon: null, color: "#22c55e", fallback: "tag" },
        count: 2,
        stale: false,
    },
];

const categoryOptions: FilterOption[] = [
    {
        value: "c1",
        label: "Groceries",
        avatar: { kind: "entity", icon: null, color: "#f97316", fallback: "tag" },
        count: 7,
        stale: false,
    },
];

interface MountProps {
    defaultExpanded?: boolean;
    activeFilterCount?: number;
    selectedTypes?: TransactionType[];
    selectedAccountIds?: string[];
    selectedCategoryIds?: string[];
    showHidden?: boolean;
}

const mounted: VueWrapper[] = [];

const mountSections = async (props: MountProps = {}) => {
    const wrapper = await mountSuspended(FilterSections, {
        props: {
            typeOptions,
            accountOptions,
            categoryOptions,
            defaultExpanded: false,
            activeFilterCount: 0,
            selectedTypes: [],
            selectedAccountIds: [],
            selectedCategoryIds: [],
            showHidden: false,
            ...props,
        },
    });
    mounted.push(wrapper);
    return wrapper;
};

// The section headers are the accordion's expander buttons, which carry aria-expanded.
const headers = (wrapper: VueWrapper) => wrapper.findAll("button[aria-expanded]");
const header = (wrapper: VueWrapper, title: string) => {
    const match = headers(wrapper).find((button) => button.text().startsWith(title));
    if (!match) throw new Error(`no header for ${title}`);
    return match;
};
const clearAll = (wrapper: VueWrapper) => {
    const button = wrapper.findAll("button").find((candidate) => candidate.text() === "Clear all");
    if (!button) throw new Error("no Clear all button");
    return button;
};

describe("TransactionsFilterSections", () => {
    afterEach(() => {
        mounted.splice(0).forEach((wrapper) => wrapper.unmount());
    });

    it("opens every section when default-expanded", async () => {
        const wrapper = await mountSections({ defaultExpanded: true });

        expect(headers(wrapper).map((button) => button.attributes("aria-expanded"))).toEqual(["true", "true", "true"]);
    });

    it("starts every section collapsed by default", async () => {
        const wrapper = await mountSections();

        expect(headers(wrapper).map((button) => button.attributes("aria-expanded"))).toEqual([
            "false",
            "false",
            "false",
        ]);
    });

    it("reads All in a header with no selection, then the picked label", async () => {
        const wrapper = await mountSections();

        expect(header(wrapper, "Accounts").text()).toMatch(/All$/);

        await wrapper.setProps({ selectedAccountIds: ["a1"] });

        expect(header(wrapper, "Accounts").text()).toMatch(/Checking$/);
    });

    it("counts several picked accounts in the header", async () => {
        const wrapper = await mountSections({ selectedAccountIds: ["a1", "a2"] });

        expect(header(wrapper, "Accounts").text()).toMatch(/2 accounts$/);
    });

    it("joins several picked types with a plus", async () => {
        const wrapper = await mountSections({ selectedTypes: ["income", "expense"] });

        expect(header(wrapper, "Type").text()).toMatch(/Income \+ Expense$/);
    });

    it("disables Clear all when nothing is active", async () => {
        const wrapper = await mountSections({ activeFilterCount: 0 });

        expect(clearAll(wrapper).attributes("disabled")).toBeDefined();
    });

    it("renders Clear all as a text action, not an outlined button", async () => {
        const wrapper = await mountSections({ activeFilterCount: 2 });

        expect(clearAll(wrapper).classes()).toContain("p-button-link");
        expect(clearAll(wrapper).classes()).not.toContain("p-button-outlined");
    });

    it("emits clear-all when Clear all is enabled and pressed", async () => {
        const wrapper = await mountSections({ activeFilterCount: 2 });

        expect(clearAll(wrapper).attributes("disabled")).toBeUndefined();
        await clearAll(wrapper).trigger("click");

        expect(wrapper.emitted("clear-all")).toHaveLength(1);
    });

    it("labels the Show hidden switch and writes showHidden when it is switched on", async () => {
        const wrapper = await mountSections({ showHidden: false });
        const toggle = wrapper.find('[role="switch"]');
        // The option rows are labels too, so the Show hidden label is the one that reads that text.
        const label = wrapper.findAll("label").find((candidate) => candidate.text() === "Show hidden transactions");
        if (!label) throw new Error("no Show hidden label");

        expect(label.text()).toBe("Show hidden transactions");
        expect(label.attributes("for")).toBe(toggle.attributes("id"));

        await toggle.setValue(true);

        expect(wrapper.emitted("update:showHidden")?.at(-1)).toEqual([true]);
    });
});
