import { afterEach, describe, expect, it } from "vitest";
import { mountSuspended } from "@nuxt/test-utils/runtime";
import { flushPromises, type VueWrapper } from "@vue/test-utils";
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

// Focus only moves to elements in the document, so a test about focus mounts the picker attached to it.
const mountPicker = async (noun: "accounts" | "types", options: FilterOption[], selected: string[], attach = false) => {
    const wrapper = await mountSuspended(FilterPicker, {
        props: { noun, options, selected },
        attachTo: attach ? document.body : undefined,
        // Real transitions, so the popover's show and hide events fire.
        global: { stubs: { transition: false } },
    });
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

describe("TransactionsFilterPicker focus", () => {
    it("moves focus to the All row when the popover opens", async () => {
        const wrapper = await mountPicker("accounts", accounts, []);

        await trigger(wrapper).trigger("click");
        await flushPromises();

        const allRow = document.body.querySelector("button[autofocus]");
        expect(allRow).not.toBeNull();
        expect(document.activeElement).toBe(allRow);
    });

    it("returns focus to the trigger when the popover closes", async () => {
        const wrapper = await mountPicker("accounts", accounts, [], true);
        const triggerButton = trigger(wrapper).element;

        await trigger(wrapper).trigger("click");
        await flushPromises();
        // A second click on the trigger toggles the popover closed.
        await trigger(wrapper).trigger("click");
        await flushPromises();

        expect(document.activeElement).toBe(triggerButton);
    });

    it("sends focus to the trigger when the clear button is activated from the keyboard", async () => {
        const wrapper = await mountPicker("accounts", accounts, ["a"], true);
        const triggerButton = trigger(wrapper).element;
        const clearEl = clearButton(wrapper).element as HTMLElement;

        // Focus the × first, as a Tab would, so clearing it has to move focus rather than leave it on a dropped node.
        clearEl.focus();
        await clearButton(wrapper).trigger("click");
        await flushPromises();

        expect(document.activeElement).toBe(triggerButton);
    });
});
