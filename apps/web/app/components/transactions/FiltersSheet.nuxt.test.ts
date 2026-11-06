import { afterEach, describe, expect, it, vi } from "vitest";
import { mountSuspended } from "@nuxt/test-utils/runtime";
import type { VueWrapper } from "@vue/test-utils";
import FiltersSheet from "./FiltersSheet.vue";
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
    activeFilterCount?: number;
    selectedAccountIds?: string[];
}

const mounted: VueWrapper[] = [];

const mountSheet = async ({ activeFilterCount = 0, selectedAccountIds = [] }: MountProps = {}) => {
    const wrapper = await mountSuspended(FiltersSheet, {
        props: {
            visible: true,
            typeOptions,
            accountOptions,
            categoryOptions,
            activeFilterCount,
            selectedTypes: [],
            selectedAccountIds,
            selectedCategoryIds: [],
            showHidden: false,
        },
    });
    mounted.push(wrapper);
    return wrapper;
};

// The sheet teleports to <body>, so everything is read from the document.
const sheet = () => document.body.querySelector<HTMLElement>("[data-bottom-sheet]");
const sectionHeaders = () => Array.from(sheet()?.querySelectorAll<HTMLButtonElement>("button[aria-expanded]") ?? []);
const sectionHeader = (title: string) => {
    const match = sectionHeaders().find((button) => button.textContent?.startsWith(title));
    if (!match) throw new Error(`no section header for ${title}`);
    return match;
};
const sheetButton = (text: string) => {
    const match = Array.from(sheet()?.querySelectorAll<HTMLButtonElement>("button") ?? []).find(
        (button) => button.textContent?.trim() === text,
    );
    if (!match) throw new Error(`no ${text} button`);
    return match;
};
const row = (label: string) => {
    const match = sheet()?.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`);
    if (!match) throw new Error(`no row labelled ${label}`);
    return match;
};

describe("FiltersSheet", () => {
    afterEach(() => {
        mounted.splice(0).forEach((wrapper) => wrapper.unmount());
    });

    it("opens with every section collapsed", async () => {
        await mountSheet();

        await vi.waitFor(() => expect(sectionHeaders()).toHaveLength(3));
        expect(sectionHeaders().map((button) => button.getAttribute("aria-expanded"))).toEqual([
            "false",
            "false",
            "false",
        ]);
    });

    it("expands Accounts and writes the account picked", async () => {
        const wrapper = await mountSheet();
        await vi.waitFor(() => expect(sectionHeaders()).toHaveLength(3));

        sectionHeader("Accounts").click();
        await vi.waitFor(() => expect(row("Checking, 4 transactions")).toBeTruthy());
        row("Checking, 4 transactions").click();

        expect(wrapper.emitted("update:selectedAccountIds")?.at(-1)).toEqual([["a1"]]);
    });

    it("disables Clear all when nothing is active", async () => {
        await mountSheet({ activeFilterCount: 0 });

        await vi.waitFor(() => expect(sheetButton("Clear all").disabled).toBe(true));
    });

    it("enables Clear all when only the period is non-default", async () => {
        await mountSheet({ activeFilterCount: 1 });

        await vi.waitFor(() => expect(sheetButton("Clear all").disabled).toBe(false));
    });

    it("closes the sheet from Show results", async () => {
        const wrapper = await mountSheet();
        await vi.waitFor(() => expect(sheetButton("Show results")).toBeTruthy());

        sheetButton("Show results").click();

        expect(wrapper.emitted("update:visible")?.at(-1)).toEqual([false]);
    });
});
