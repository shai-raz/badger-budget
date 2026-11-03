import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mountSuspended } from "@nuxt/test-utils/runtime";
import { flushPromises, type VueWrapper } from "@vue/test-utils";
import { computed, ref } from "vue";
import Checkbox from "primevue/checkbox";
import type { RuleDraft, RulePreviewItem } from "@badger/types";
import { selectAll, type RuleSelection } from "~/utils/ruleReviewSelection";
import RuleReview from "./RuleReview.vue";

const list = vi.hoisted(() => ({
    items: [] as RulePreviewItem[],
    total: 0,
    alreadyTargetCount: 0,
    counts: { all: 0, uncategorized: 0, categorized: 0 },
}));

vi.mock("~/composables/rules/useRulePreviewList", () => ({
    useRulePreviewList: () => ({
        items: computed(() => list.items),
        wouldChangeCount: computed(() => list.total),
        alreadyTargetCount: computed(() => list.alreadyTargetCount),
        counts: computed(() => list.counts),
        fetchNextPage: vi.fn(),
        hasNextPage: ref(false),
        isFetchingNextPage: ref(false),
        isLoading: ref(false),
        error: ref(null),
    }),
}));

const draft: RuleDraft = {
    conditions: [{ field: "description", operator: "contains", value: "coffee" }],
    actions: [{ type: "set_category", value: "cat-coffee" }],
};

const category = { name: "Coffee", color: "#92400e", icon: null };

const row = (id: string, description: string, categoryName: string | null = null): RulePreviewItem => ({
    id,
    description,
    transactionDate: "2026-10-01",
    amount: 4.5,
    type: "expense",
    currencyCode: "USD",
    accountName: "Checking",
    category: categoryName ? { id: `cat-${id}`, name: categoryName, color: "#16a34a", icon: null } : null,
});

const mounted: VueWrapper[] = [];

/** Mounts the review with the selection wired back in, the way the editor holds it. */
const mountReview = async (selection: RuleSelection = selectAll()) => {
    const wrapper: VueWrapper = await mountSuspended(RuleReview, {
        props: {
            draft,
            category,
            selection,
            "onUpdate:selection": (value: RuleSelection) => wrapper.setProps({ selection: value }),
        },
    });
    mounted.push(wrapper);
    await flushPromises();
    return wrapper;
};

// Checkboxes in order: the header first, then one per row.
const checkboxes = (wrapper: VueWrapper) => wrapper.findAllComponents(Checkbox);

beforeEach(() => {
    list.items = [row("a", "Blue Bottle", "Eating out"), row("b", "Cafe Nero"), row("c", "Pret A Manger")];
    list.total = 3;
    list.alreadyTargetCount = 1;
    list.counts = { all: 3, uncategorized: 1, categorized: 2 };
});

afterEach(() => {
    for (const wrapper of mounted.splice(0)) wrapper.unmount();
});

describe("RuleReview", () => {
    it("summarises the would-change count and the rows already in the category", async () => {
        const wrapper = await mountReview();

        expect(wrapper.text()).toContain("3 transactions would move to");
        expect(wrapper.text()).toContain("1 more already have it.");
    });

    it("toggles every row from the header, then single rows", async () => {
        const wrapper = await mountReview();
        expect(wrapper.text()).toContain("3 of 3 selected");

        checkboxes(wrapper)[1]?.vm.$emit("update:modelValue", false);
        await flushPromises();
        expect(wrapper.text()).toContain("2 of 3 selected");

        checkboxes(wrapper)[0]?.vm.$emit("update:modelValue", true);
        await flushPromises();
        expect(wrapper.text()).toContain("3 of 3 selected");
    });

    it("clears to nothing from a full header, and reads the partial state as some", async () => {
        const wrapper = await mountReview();

        checkboxes(wrapper)[0]?.vm.$emit("update:modelValue", true);
        await flushPromises();
        expect(wrapper.text()).toContain("0 of 3 selected");

        checkboxes(wrapper)[2]?.vm.$emit("update:modelValue", true);
        await flushPromises();
        expect(wrapper.text()).toContain("1 of 3 selected");
        expect(checkboxes(wrapper)[0]?.props("indeterminate")).toBe(true);
    });

    it("shows each filter pill with its count and marks the active one as pressed", async () => {
        const wrapper = await mountReview();
        const pill = (label: string) => wrapper.findAll("button").find((button) => button.text().startsWith(label));

        expect(pill("All")?.text()).toContain("3");
        expect(pill("Uncategorized")?.text()).toContain("1");
        expect(pill("Has a category")?.text()).toContain("2");
        expect(pill("All")?.attributes("aria-pressed")).toBe("true");

        await pill("Has a category")?.trigger("click");
        expect(pill("Has a category")?.attributes("aria-pressed")).toBe("true");
        expect(pill("All")?.attributes("aria-pressed")).toBe("false");
    });

    it("marks an unticked row as staying in its category", async () => {
        const wrapper = await mountReview();
        expect(wrapper.text()).toContain("Eating out \u2192 Coffee");

        checkboxes(wrapper)[2]?.vm.$emit("update:modelValue", false);
        await flushPromises();

        expect(wrapper.text()).toContain("Uncategorized \u2192 stays as it is");
        expect(wrapper.text()).toContain("Eating out \u2192 Coffee");
    });
});
