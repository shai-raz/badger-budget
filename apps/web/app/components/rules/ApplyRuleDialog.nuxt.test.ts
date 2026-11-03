import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockNuxtImport, mountSuspended } from "@nuxt/test-utils/runtime";
import { flushPromises, type VueWrapper } from "@vue/test-utils";
import { computed, reactive, ref, toValue, watch, type MaybeRefOrGetter } from "vue";
import Checkbox from "primevue/checkbox";
import type { Category, IRule, RuleDraft, RulePreviewItem } from "@badger/types";
import ApplyRuleDialog from "./ApplyRuleDialog.vue";

const api = vi.hoisted(() => ({ applyRule: vi.fn() }));
const toast = vi.hoisted(() => ({ add: vi.fn() }));
const list = vi.hoisted(() => ({
    items: [] as RulePreviewItem[],
    total: 0,
    matchCount: 0,
    counts: null as { all: number; uncategorized: number; categorized: number } | null,
    draft: null as RuleDraft | null,
    placeholder: false,
}));
// The mock reads through a reactive view, so a test can change the list while the dialog stays mounted.
const state = reactive(list);

vi.mock("primevue/usetoast", () => ({ useToast: () => toast }));
mockNuxtImport("useApiClient", () => () => api);
mockNuxtImport("useGetCategoriesQuery", () => () => ({ data: ref(categories) }));
vi.mock("~/composables/rules/useRulePreviewList", () => ({
    useRulePreviewList: (draft: MaybeRefOrGetter<RuleDraft | null>) => {
        // Watching the draft, as the real query does, so each change reaches the list state.
        watch(
            () => toValue(draft),
            (value) => (list.draft = value),
            { immediate: true },
        );
        return {
            items: computed(() => state.items),
            wouldChangeCount: computed(() => state.total),
            matchCount: computed(() => state.matchCount),
            alreadyTargetCount: computed(() => state.matchCount - state.total),
            counts: computed(() => state.counts),
            fetchNextPage: vi.fn(),
            hasNextPage: ref(false),
            isFetchingNextPage: ref(false),
            isLoading: ref(false),
            isPlaceholderData: computed(() => state.placeholder),
            error: ref(null),
        };
    },
}));

const categories: Category[] = [
    {
        id: "cat-coffee",
        userId: null,
        name: "Coffee",
        color: "#92400e",
        isSystem: false,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    },
];

const rule: IRule = {
    id: "rule-1",
    name: "Coffee shops",
    priority: 1,
    stopOnMatch: false,
    isActive: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    conditions: [{ id: "cond-1", field: "description", operator: "contains", value: "coffee", position: 0 }],
    actions: [{ id: "act-1", type: "set_category", value: "cat-coffee", position: 0 }],
};

// A second rule in the same category, so only its name and conditions tell the two dialogs apart.
const ruleB: IRule = {
    ...rule,
    id: "rule-2",
    name: "Bakeries",
    conditions: [{ id: "cond-2", field: "description", operator: "contains", value: "bakery", position: 0 }],
};

const row = (id: string, description: string): RulePreviewItem => ({
    id,
    description,
    transactionDate: "2026-10-01",
    amount: -4.5,
    type: "expense",
    transferDirection: null,
    currencyCode: "USD",
    accountName: "Checking",
    category: null,
});

const mounted: VueWrapper[] = [];

const mountDialog = async () => {
    const wrapper: VueWrapper = await mountSuspended(ApplyRuleDialog, {
        props: { visible: true, rule },
    });
    mounted.push(wrapper);
    await flushPromises();
    return wrapper;
};

// The dialog teleports to <body>, so its buttons are read from the document.
const buttonLabelled = (label: string) =>
    Array.from(document.body.querySelectorAll<HTMLButtonElement>("button")).find(
        (button) => button.textContent?.trim() === label,
    );

const clickButton = async (label: string) => {
    const button = buttonLabelled(label);
    if (!button) throw new Error(`no button labelled ${label}`);
    button.click();
    await flushPromises();
};

// Checkboxes in order: the header first, then one per row.
const checkboxes = (wrapper: VueWrapper) => wrapper.findAllComponents(Checkbox);

beforeEach(() => {
    api.applyRule.mockReset();
    api.applyRule.mockResolvedValue({ count: 2 });
    toast.add.mockReset();
    list.items = [row("a", "Blue Bottle"), row("b", "Cafe Nero"), row("c", "Pret A Manger")];
    list.total = 3;
    list.matchCount = 4;
    list.counts = { all: 3, uncategorized: 3, categorized: 0 };
    list.placeholder = false;
});

afterEach(() => {
    for (const wrapper of mounted.splice(0)) wrapper.unmount();
});

describe("ApplyRuleDialog", () => {
    it("applies all but the unticked rows, then closes with a toast", async () => {
        const wrapper = await mountDialog();

        checkboxes(wrapper)[2]?.vm.$emit("update:modelValue", false);
        await flushPromises();
        await clickButton("Apply to 2");

        expect(api.applyRule).toHaveBeenCalledWith("rule-1", { mode: "allExcept", ids: ["b"] });
        expect(wrapper.emitted("update:visible")).toEqual([[false]]);
        expect(toast.add).toHaveBeenCalledWith(
            expect.objectContaining({ severity: "success", summary: "Moved 2 transactions to Coffee." }),
        );
    });

    it("keeps the dialog open and shows the API error when the apply fails", async () => {
        api.applyRule.mockRejectedValueOnce({ response: { data: { message: "Rule not found" } } });
        const wrapper = await mountDialog();

        await clickButton("Apply to 3");

        expect(wrapper.emitted("update:visible")).toBeUndefined();
        expect(toast.add).not.toHaveBeenCalled();
        expect(document.body.textContent).toContain("Rule not found");
    });

    it("says nothing to change, and offers only Close, when no matched transaction would move", async () => {
        list.items = [];
        list.total = 0;
        list.matchCount = 3;
        await mountDialog();

        expect(document.body.textContent).toContain("Nothing to change");
        expect(document.body.textContent).toContain("All 3 transactions this rule matches already have Coffee.");
        expect(buttonLabelled("Close")).toBeDefined();
        expect(document.body.textContent).not.toContain("Apply to");
    });

    it("says no transaction matches yet, rather than counting zero, when the rule matches nothing", async () => {
        list.items = [];
        list.total = 0;
        list.matchCount = 0;
        await mountDialog();

        expect(document.body.textContent).toContain("No existing transactions match this rule yet.");
        expect(document.body.textContent).not.toContain("All 0");
    });

    it("previews only while open, so a closed dialog keeps no live query", async () => {
        const wrapper = await mountDialog();
        expect(list.draft).not.toBeNull();

        await wrapper.setProps({ visible: false });
        expect(list.draft).toBeNull();

        await wrapper.setProps({ visible: true });
        expect(list.draft).not.toBeNull();
    });

    it("shows neither 'Nothing to change' nor a count while another rule's list is only placeholder data", async () => {
        // Rule A matches transactions that already have the category, so the dialog says nothing to change.
        list.items = [];
        list.total = 0;
        list.matchCount = 3;
        const wrapper = await mountDialog();
        expect(document.body.textContent).toContain("Nothing to change");

        await wrapper.setProps({ visible: false });
        // Opening rule B: its first page is still loading, so the list holds rule A's totals as placeholder data.
        state.placeholder = true;
        await wrapper.setProps({ visible: true, rule: ruleB });
        await flushPromises();

        expect(document.body.textContent).not.toContain("Nothing to change");
        expect(document.body.textContent).not.toContain("All 3 transactions");
        expect(buttonLabelled("Apply")?.disabled).toBe(true);
        expect(buttonLabelled("Apply to 0")).toBeUndefined();
        expect(api.applyRule).not.toHaveBeenCalled();

        // Rule B's first page lands: its own totals and rows take over.
        state.placeholder = false;
        state.items = [row("d", "Bakery Lane")];
        state.total = 1;
        state.matchCount = 1;
        await flushPromises();

        expect(document.body.textContent).toContain("Bakeries");
        expect(document.body.textContent).not.toContain("Nothing to change");
        expect(buttonLabelled("Apply to 1")?.disabled).toBe(false);
    });

    it("disables Apply when no transaction is selected", async () => {
        const wrapper = await mountDialog();

        // The header box clears a fully selected list.
        checkboxes(wrapper)[0]?.vm.$emit("update:modelValue", true);
        await flushPromises();

        expect(buttonLabelled("Apply to 0")?.disabled).toBe(true);
        expect(api.applyRule).not.toHaveBeenCalled();
    });
});
