import { afterEach, describe, expect, it } from "vitest";
import { mountSuspended } from "@nuxt/test-utils/runtime";
import type { VueWrapper } from "@vue/test-utils";
import FilterPicker from "./FilterPicker.vue";
import type { FilterOption } from "~/utils/filterOptions";

const accounts: FilterOption[] = [
    {
        value: "a",
        label: "Chequing",
        avatar: { kind: "entity", icon: null, color: "#3b82f6", fallback: "tag" },
        count: 5,
        stale: false,
    },
    {
        value: "b",
        label: "Savings",
        avatar: { kind: "entity", icon: null, color: "#22c55e", fallback: "tag" },
        count: 2,
        stale: false,
    },
    {
        value: "c",
        label: "Travel card",
        avatar: { kind: "entity", icon: null, color: "#f97316", fallback: "tag" },
        count: 1,
        stale: false,
    },
];

const types: FilterOption[] = [
    { value: "income", label: "Income", avatar: { kind: "type", type: "income" }, count: 3, stale: false },
    { value: "expense", label: "Expenses", avatar: { kind: "type", type: "expense" }, count: 9, stale: false },
];

const mounted: VueWrapper[] = [];

const mountPicker = async (noun: "accounts" | "types", options: FilterOption[], selected: string[]) => {
    const wrapper = await mountSuspended(FilterPicker, { props: { noun, options, selected } });
    mounted.push(wrapper);
    return wrapper;
};

const trigger = (wrapper: VueWrapper) => wrapper.find('[aria-haspopup="dialog"]');
const clearButton = (wrapper: VueWrapper) => wrapper.find('[aria-label="Clear accounts filter"]');

afterEach(() => {
    mounted.splice(0).forEach((wrapper) => wrapper.unmount());
});

describe("TransactionsFilterPicker label", () => {
    it("shows the filter title when nothing is selected", async () => {
        const wrapper = await mountPicker("accounts", accounts, []);

        expect(trigger(wrapper).text()).toBe("Accounts");
    });

    it("shows the option's name when one is selected", async () => {
        const wrapper = await mountPicker("accounts", accounts, ["b"]);

        expect(trigger(wrapper).text()).toBe("Savings");
    });

    it("counts several accounts", async () => {
        const wrapper = await mountPicker("accounts", accounts, ["a", "b", "c"]);

        expect(trigger(wrapper).text()).toBe("3 accounts");
    });

    it("joins several types with a plus sign", async () => {
        const wrapper = await mountPicker("types", types, ["income", "expense"]);

        expect(trigger(wrapper).text()).toBe("Income + Expenses");
    });
});

describe("TransactionsFilterPicker clear", () => {
    it("shows no clear button while nothing is selected", async () => {
        const wrapper = await mountPicker("accounts", accounts, []);

        expect(clearButton(wrapper).exists()).toBe(false);
    });

    it("shows the clear button once something is selected", async () => {
        const wrapper = await mountPicker("accounts", accounts, ["a"]);

        expect(clearButton(wrapper).exists()).toBe(true);
    });

    it("clears only this picker's selection", async () => {
        const wrapper = await mountPicker("accounts", accounts, ["a", "b"]);

        await clearButton(wrapper).trigger("click");

        expect(wrapper.emitted("update:selected")?.at(-1)).toEqual([[]]);
    });
});

describe("TransactionsFilterPicker trigger", () => {
    it("starts as a closed dialog trigger", async () => {
        const wrapper = await mountPicker("accounts", accounts, []);

        expect(trigger(wrapper).attributes("aria-expanded")).toBe("false");
    });
});
