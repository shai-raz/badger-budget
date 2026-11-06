import { afterEach, describe, expect, it } from "vitest";
import { mountSuspended } from "@nuxt/test-utils/runtime";
import type { DOMWrapper, VueWrapper } from "@vue/test-utils";
import FilterOptionList from "./FilterOptionList.vue";
import type { FilterOption } from "~/utils/filterOptions";

const options: FilterOption[] = [
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
        count: 0,
        stale: true,
    },
];

const mounted: VueWrapper[] = [];

const mountList = async (selected: string[] = [], props: Record<string, unknown> = {}) => {
    const wrapper = await mountSuspended(FilterOptionList, {
        props: { options, allLabel: "All accounts", selected, ...props },
    });
    mounted.push(wrapper);
    return wrapper;
};

// A row is the <label> whose checkbox input carries the option's aria-label.
const row = (wrapper: VueWrapper, label: string) => {
    const match = wrapper.findAll("label").find((candidate) => candidate.find(`input[aria-label="${label}"]`).exists());
    if (!match) throw new Error(`no row labelled ${label}`);
    return match;
};

// The All row is the <label> whose text is the All label; its checkbox has no aria-label of its own.
const allRow = (wrapper: VueWrapper, text: string) => {
    const match = wrapper.findAll("label").find((candidate) => candidate.text() === text);
    if (!match) throw new Error(`no All row labelled ${text}`);
    return match;
};

const button = (wrapper: VueWrapper, text: string) => {
    const element = wrapper.findAll("button").find((candidate) => candidate.text() === text);
    if (!element) throw new Error(`no button labelled ${text}`);
    return element;
};

const checked = (row: DOMWrapper<Element>) => (row.find("input").element as HTMLInputElement).checked;

const lastEmit = (wrapper: VueWrapper) => wrapper.emitted("update:selected")?.at(-1);

describe("TransactionsFilterOptionList selection", () => {
    afterEach(() => {
        mounted.splice(0).forEach((wrapper) => wrapper.unmount());
    });

    it("clears the selection from the All row", async () => {
        const wrapper = await mountList(["a"]);

        await allRow(wrapper, "All accounts").trigger("click");

        expect(lastEmit(wrapper)).toEqual([[]]);
    });

    it("toggles a row and emits the new selection", async () => {
        const wrapper = await mountList();

        await row(wrapper, "Chequing, 5 transactions").trigger("click");

        expect(lastEmit(wrapper)).toEqual([["a"]]);
    });

    it("toggles once when the checkbox input itself is clicked", async () => {
        const wrapper = await mountList();

        await row(wrapper, "Chequing, 5 transactions").find("input").trigger("click");

        expect(wrapper.emitted("update:selected")).toHaveLength(1);
        expect(lastEmit(wrapper)).toEqual([["a"]]);
    });

    it("cancels the native toggle of a click dispatched on the checkbox input", async () => {
        const wrapper = await mountList();
        const event = new MouseEvent("click", { bubbles: true, cancelable: true });

        row(wrapper, "Chequing, 5 transactions").find("input").element.dispatchEvent(event);

        expect(event.defaultPrevented).toBe(true);
    });

    it("emits an empty selection when the last offered option is selected", async () => {
        const wrapper = await mountList(["a", "b"]);

        await row(wrapper, "Travel card, 0 transactions").trigger("click");

        expect(lastEmit(wrapper)).toEqual([[]]);
    });

    it("keeps a collapsed row's checkbox in step with the unchanged selection", async () => {
        const wrapper = await mountList(["a", "b"]);
        const travel = row(wrapper, "Travel card, 0 transactions");

        await travel.trigger("click");
        await wrapper.setProps({ selected: [] });

        expect(checked(travel)).toBe(false);
        expect(travel.find(".p-checkbox").classes()).not.toContain("p-checkbox-checked");
    });

    it("keeps a clicked checked All checked when the selection does not change", async () => {
        const wrapper = await mountList([]);
        const all = allRow(wrapper, "All accounts");

        await all.trigger("click");
        await wrapper.setProps({ selected: [] });

        expect(lastEmit(wrapper)).toEqual([[]]);
        expect(checked(all)).toBe(true);
    });

    it("checks the All box only while nothing is selected", async () => {
        const wrapper = await mountList([]);

        expect(checked(allRow(wrapper, "All accounts"))).toBe(true);
        expect(checked(row(wrapper, "Chequing, 5 transactions"))).toBe(false);
    });

    it("unchecks the All box and checks only the selected option's box", async () => {
        const wrapper = await mountList(["a"]);

        expect(checked(allRow(wrapper, "All accounts"))).toBe(false);
        expect(checked(row(wrapper, "Chequing, 5 transactions"))).toBe(true);
        expect(checked(row(wrapper, "Savings, 2 transactions"))).toBe(false);
    });

    it("inverts to the offered options that were not selected", async () => {
        const wrapper = await mountList(["a"]);

        await button(wrapper, "Invert").trigger("click");

        expect(lastEmit(wrapper)).toEqual([["b", "c"]]);
    });

    it("empties the selection from Clear", async () => {
        const wrapper = await mountList(["a"]);

        await button(wrapper, "Clear").trigger("click");

        expect(lastEmit(wrapper)).toEqual([[]]);
    });

    it("disables Clear when nothing is selected", async () => {
        const wrapper = await mountList([]);

        expect((button(wrapper, "Clear").element as HTMLButtonElement).disabled).toBe(true);
    });

    it("dims a stale row", async () => {
        const wrapper = await mountList(["c"]);

        expect(row(wrapper, "Travel card, 0 transactions").classes()).toContain("opacity-60");
        expect(row(wrapper, "Chequing, 5 transactions").classes()).not.toContain("opacity-60");
    });

    it("bolds a selected row", async () => {
        const wrapper = await mountList(["a"]);

        expect(row(wrapper, "Chequing, 5 transactions").classes()).toContain("font-semibold");
        expect(row(wrapper, "Savings, 2 transactions").classes()).not.toContain("font-semibold");
    });
});

describe("TransactionsFilterOptionList focus and markup", () => {
    afterEach(() => {
        mounted.splice(0).forEach((wrapper) => wrapper.unmount());
    });

    it("autofocuses the All checkbox when autofocusFirst is set", async () => {
        const wrapper = await mountList([], { autofocusFirst: true });

        expect(allRow(wrapper, "All accounts").find("input").element.hasAttribute("autofocus")).toBe(true);
    });

    it("does not autofocus by default", async () => {
        const wrapper = await mountList();

        expect(allRow(wrapper, "All accounts").find("input").element.hasAttribute("autofocus")).toBe(false);
    });

    it("draws every row as a label around a PrimeVue checkbox, with no button", async () => {
        const wrapper = await mountList(["a"]);

        const rows = wrapper.findAll("label");
        expect(rows).toHaveLength(4);
        rows.forEach((candidate) => {
            expect(candidate.find('.p-checkbox input[type="checkbox"]').exists()).toBe(true);
        });
        expect(wrapper.find("button input").exists()).toBe(false);
    });
});

describe("TransactionsFilterOptionList placement", () => {
    afterEach(() => {
        mounted.splice(0).forEach((wrapper) => wrapper.unmount());
    });

    it("renders the title with Invert and Clear in the header", async () => {
        const wrapper = await mountList(["a"], { actionsPlacement: "header", title: "Accounts" });

        expect(wrapper.text()).toContain("Accounts");
        expect(button(wrapper, "Invert").exists()).toBe(true);
        expect(button(wrapper, "Clear").exists()).toBe(true);
    });
});
