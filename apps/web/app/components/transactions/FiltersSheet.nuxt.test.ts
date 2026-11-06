import { afterEach, describe, expect, it } from "vitest";
import { mountSuspended } from "@nuxt/test-utils/runtime";
import type { VueWrapper } from "@vue/test-utils";
import FiltersSheet from "./FiltersSheet.vue";
import type { FilterOption } from "~/utils/filterOptions";

const options: FilterOption[] = [
    {
        value: "uncategorized",
        label: "Uncategorized",
        avatar: { kind: "entity", icon: null, color: "#9CA3AF", fallback: "tag" },
        count: 2,
        stale: false,
    },
    {
        value: "c1",
        label: "Groceries",
        avatar: { kind: "entity", icon: null, color: "#22c55e", fallback: "tag" },
        count: 14,
        stale: false,
    },
    {
        value: "c2",
        label: "Travel",
        avatar: { kind: "entity", icon: null, color: "#3b82f6", fallback: "tag" },
        count: 0,
        stale: true,
    },
    {
        value: "c3",
        label: "Rent",
        avatar: { kind: "entity", icon: null, color: "#f97316", fallback: "tag" },
        count: 1,
        stale: false,
    },
    {
        value: "c4",
        label: "Misc",
        avatar: { kind: "entity", icon: null, color: "#a855f7", fallback: "tag" },
        stale: false,
    },
];

const mounted: VueWrapper[] = [];

const mountSheet = async (selectedCategoryIds: string[] = ["c2"]) => {
    const wrapper = await mountSuspended(FiltersSheet, {
        props: {
            visible: true,
            categoryOptions: options,
            selectedTypes: [],
            selectedCategoryIds,
            showHidden: false,
        },
    });
    mounted.push(wrapper);
    return wrapper;
};

// The sheet teleports to <body>, so its rows are read from the document.
const row = (label: string): HTMLButtonElement => {
    const button = document.body.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
    if (!button) throw new Error(`no row labelled ${label}`);
    return button;
};

const check = (label: string): HTMLElement => {
    const icon = row(label).querySelector<HTMLElement>(".pi-check");
    if (!icon) throw new Error(`no check icon in ${label}`);
    return icon;
};

describe("FiltersSheet category rows", () => {
    afterEach(() => {
        mounted.splice(0).forEach((wrapper) => wrapper.unmount());
    });

    it("names each category row with its transaction count", async () => {
        await mountSheet();

        expect(row("Groceries, 14 transactions").textContent).toContain("14");
        expect(row("Rent, 1 transaction").textContent).toContain("1");
    });

    it("keeps a check icon mounted in every row and hides it when unselected", async () => {
        await mountSheet(["c2"]);

        expect(check("Groceries, 14 transactions").classList).toContain("invisible");
        expect(check("Rent, 1 transaction").classList).toContain("invisible");
    });

    it("shows the check icon on a selected row", async () => {
        await mountSheet(["c2"]);

        expect(check("Travel, 0 transactions").classList).not.toContain("invisible");
    });

    it("dims only the stale row", async () => {
        await mountSheet(["c2"]);

        expect(row("Travel, 0 transactions").classList).toContain("opacity-60");
        expect(row("Groceries, 14 transactions").classList).not.toContain("opacity-60");
    });

    it("keeps the touch target at py-3", async () => {
        await mountSheet();

        expect(row("Groceries, 14 transactions").classList).toContain("py-3");
    });

    it("renders no count and labels only the name when the count is unknown", async () => {
        await mountSheet();

        expect(row("Misc").textContent?.trim()).toBe("Misc");
    });

    it("emits the selection without a stale option when it is tapped", async () => {
        const wrapper = await mountSheet(["c2"]);

        row("Travel, 0 transactions").click();

        expect(wrapper.emitted("update:selectedCategoryIds")?.at(-1)).toEqual([[]]);
    });
});
