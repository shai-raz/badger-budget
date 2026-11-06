import { afterEach, describe, expect, it, vi } from "vitest";
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

    it("is 36px tall in the button variant, with a 36px clear button", async () => {
        const wrapper = await mountPicker("accounts", accounts, ["a"]);

        expect(trigger(wrapper).classes()).toContain("h-9");
        expect(clearButton(wrapper).classes()).toContain("h-9");
        expect(clearButton(wrapper).classes()).toContain("w-9");
    });
});

describe("TransactionsFilterPicker focus", () => {
    it("moves focus to the All row when the popover opens", async () => {
        const wrapper = await mountPicker("accounts", accounts, []);

        await trigger(wrapper).trigger("click");
        await flushPromises();

        const allRow = document.body.querySelector("input[autofocus]");
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

// The pill's sheet teleports to <body>, so it is read from the document.
const sheet = () => document.body.querySelector<HTMLElement>("[data-bottom-sheet]");

const mountPill = async (noun: "accounts" | "types", options: FilterOption[], selected: string[], attach = false) => {
    const wrapper = await mountSuspended(FilterPicker, {
        props: { noun, options, selected, variant: "pill" },
        attachTo: attach ? document.body : undefined,
        global: { stubs: { transition: false } },
    });
    mounted.push(wrapper);
    return wrapper;
};

const sheetButton = (text: string) =>
    Array.from(sheet()?.querySelectorAll<HTMLButtonElement>("button") ?? []).find(
        (button) => button.textContent?.trim() === text,
    );

describe("TransactionsFilterPicker pill", () => {
    it("shows the selected option's label with no clear button", async () => {
        const wrapper = await mountPill("accounts", accounts, ["b"]);

        expect(trigger(wrapper).text()).toBe("Savings");
        expect(clearButton(wrapper).exists()).toBe(false);
    });

    it("is 36px tall with the button radius, not a chip", async () => {
        const wrapper = await mountPill("accounts", accounts, ["b"]);

        expect(trigger(wrapper).classes()).toContain("h-9");
        expect(trigger(wrapper).classes()).not.toContain("rounded-full");
    });

    it("opens a sheet named for the filter when tapped", async () => {
        const wrapper = await mountPill("accounts", accounts, []);
        expect(trigger(wrapper).attributes("aria-expanded")).toBe("false");
        expect(sheet()).toBeNull();

        await trigger(wrapper).trigger("click");

        await vi.waitFor(() => expect(sheet()).not.toBeNull());
        expect(sheet()!.getAttribute("aria-label")).toBe("Accounts");
        expect(trigger(wrapper).attributes("aria-expanded")).toBe("true");
    });

    it("puts the title with Invert and Clear in the list header, once, with 44px rows", async () => {
        const wrapper = await mountPill("accounts", accounts, []);
        await trigger(wrapper).trigger("click");
        await vi.waitFor(() => expect(sheet()).not.toBeNull());

        // The sheet's own title row is hidden, so the title appears once: in the list header.
        const titles = Array.from(sheet()!.querySelectorAll("span")).filter(
            (span) => span.textContent?.trim() === "Accounts",
        );
        expect(titles).toHaveLength(1);
        expect(sheetButton("Invert")).toBeDefined();
        expect(sheetButton("Clear")).toBeDefined();

        // The All row plus one row per account, each a 44px touch target.
        const rows = Array.from(sheet()!.querySelectorAll<HTMLLabelElement>("label")).filter((label) =>
            label.querySelector(".p-checkbox"),
        );
        expect(rows).toHaveLength(4);
        rows.forEach((row) => expect(row.classList).toContain("min-h-11"));
    });

    it("applies a picked row live", async () => {
        const wrapper = await mountPill("accounts", accounts, []);
        await trigger(wrapper).trigger("click");
        await vi.waitFor(() => expect(sheet()).not.toBeNull());

        sheet()!.querySelector<HTMLInputElement>('input[aria-label="Savings, 2 transactions"]')!.click();
        await flushPromises();

        expect(wrapper.emitted("update:selected")?.at(-1)).toEqual([["b"]]);
        // The sheet stays open until its own Show results is pressed.
        expect(sheet()).not.toBeNull();
    });

    it("closes the sheet on Show results", async () => {
        const wrapper = await mountPill("accounts", accounts, []);
        await trigger(wrapper).trigger("click");
        await vi.waitFor(() => expect(sheet()).not.toBeNull());

        sheetButton("Show results")!.click();

        await vi.waitFor(() => expect(sheet()).toBeNull());
        expect(trigger(wrapper).attributes("aria-expanded")).toBe("false");
    });

    it("returns focus to the pill when the sheet closes", async () => {
        const wrapper = await mountPill("types", types, [], true);
        const triggerButton = trigger(wrapper).element;
        await trigger(wrapper).trigger("click");
        await vi.waitFor(() => expect(sheet()).not.toBeNull());

        sheetButton("Show results")!.click();

        await vi.waitFor(() => expect(sheet()).toBeNull());
        await vi.waitFor(() => expect(document.activeElement).toBe(triggerButton));
    });
});
