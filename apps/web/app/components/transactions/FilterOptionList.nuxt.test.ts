import { afterEach, describe, expect, it } from "vitest";
import { mountSuspended } from "@nuxt/test-utils/runtime";
import type { VueWrapper } from "@vue/test-utils";
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

const row = (wrapper: VueWrapper, label: string) => {
    const element = wrapper.find(`[aria-label="${label}"]`);
    if (!element.exists()) throw new Error(`no row labelled ${label}`);
    return element;
};

const button = (wrapper: VueWrapper, text: string) => {
    const element = wrapper.findAll("button").find((candidate) => candidate.text() === text);
    if (!element) throw new Error(`no button labelled ${text}`);
    return element;
};

const lastEmit = (wrapper: VueWrapper) => wrapper.emitted("update:selected")?.at(-1);

describe("TransactionsFilterOptionList selection", () => {
    afterEach(() => {
        mounted.splice(0).forEach((wrapper) => wrapper.unmount());
    });

    it("clears the selection from the All row", async () => {
        const wrapper = await mountList(["a"]);

        await button(wrapper, "All accounts").trigger("click");

        expect(lastEmit(wrapper)).toEqual([[]]);
    });

    it("toggles a row and emits the new selection", async () => {
        const wrapper = await mountList();

        await row(wrapper, "Chequing, 5 transactions").trigger("click");

        expect(lastEmit(wrapper)).toEqual([["a"]]);
    });

    it("emits an empty selection when the last offered option is selected", async () => {
        const wrapper = await mountList(["a", "b"]);

        await row(wrapper, "Travel card, 0 transactions").trigger("click");

        expect(lastEmit(wrapper)).toEqual([[]]);
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

    it("presses the All row only while nothing is selected", async () => {
        const wrapper = await mountList([]);

        expect(button(wrapper, "All accounts").attributes("aria-pressed")).toBe("true");
        expect(row(wrapper, "Chequing, 5 transactions").attributes("aria-pressed")).toBe("false");
    });

    it("dims a stale row", async () => {
        const wrapper = await mountList(["c"]);

        expect(row(wrapper, "Travel card, 0 transactions").classes()).toContain("opacity-60");
        expect(row(wrapper, "Chequing, 5 transactions").classes()).not.toContain("opacity-60");
    });
});

describe("TransactionsFilterOptionList focus and markup", () => {
    afterEach(() => {
        mounted.splice(0).forEach((wrapper) => wrapper.unmount());
    });

    it("autofocuses the All row when autofocusFirst is set", async () => {
        const wrapper = await mountList([], { autofocusFirst: true });

        expect(button(wrapper, "All accounts").element.hasAttribute("autofocus")).toBe(true);
    });

    it("does not autofocus by default", async () => {
        const wrapper = await mountList();

        expect(button(wrapper, "All accounts").element.hasAttribute("autofocus")).toBe(false);
    });

    it("draws option boxes without a nested input", async () => {
        const wrapper = await mountList(["a"]);

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
