import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockNuxtImport, mountSuspended } from "@nuxt/test-utils/runtime";
import { flushPromises, type VueWrapper } from "@vue/test-utils";
import { computed, ref } from "vue";
import Checkbox from "primevue/checkbox";
import Select from "primevue/select";
import { RULE_NAME_MAX_LENGTH } from "@badger/shared-data";
import type {
    Category,
    IAccountResponse,
    IRule,
    ITransactionResponse,
    RulePreviewItem,
    RulePreviewResponse,
} from "@badger/types";
import type { RuleEditorDialogState } from "~/composables/useRuleEditorDialog";
import CategorySelect from "~/components/categories/CategorySelect.vue";
import RuleConditionRow from "./RuleConditionRow.vue";
import RuleReview from "./RuleReview.vue";
import RuleEditorDialog from "./RuleEditorDialog.vue";

const dialog = vi.hoisted(() => ({
    state: {
        visible: true,
        mode: "create",
        rule: null,
        prefillTransaction: null,
        openCount: 1,
    } as RuleEditorDialogState,
    close: vi.fn(),
}));
const api = vi.hoisted(() => ({
    createRule: vi.fn(),
    updateRule: vi.fn(),
}));
const previewState = vi.hoisted(() => ({ value: null as RulePreviewResponse | null, checking: false }));
const listState = vi.hoisted(() => ({ items: [] as RulePreviewItem[], total: 0 }));

mockNuxtImport("useRuleEditorDialog", () => () => ({ state: ref(dialog.state), close: dialog.close }));
mockNuxtImport("useApiClient", () => () => api);
mockNuxtImport("useGetAccounts", () => () => ({ data: ref(accounts) }));
mockNuxtImport("useGetCategoriesQuery", () => () => ({ data: ref(categories) }));
vi.mock("~/composables/rules/useRulePreview", () => ({
    useRulePreviewCount: () => ({
        preview: computed(() => previewState.value),
        checking: computed(() => previewState.checking),
    }),
}));

vi.mock("~/composables/rules/useRulePreviewList", () => ({
    useRulePreviewList: () => ({
        items: computed(() => listState.items),
        wouldChangeCount: computed(() => listState.total),
        alreadyTargetCount: computed(() => 1),
        counts: computed(() => ({ all: listState.total, uncategorized: listState.total, categorized: 0 })),
        fetchNextPage: vi.fn(),
        hasNextPage: ref(false),
        isFetchingNextPage: ref(false),
        isLoading: ref(false),
        error: ref(null),
    }),
}));

const timestamp = new Date("2026-01-01T00:00:00.000Z");

const makeAccount = (id: string, name: string): IAccountResponse => ({
    id,
    name,
    accountNumber: null,
    type: "bank",
    icon: null,
    color: null,
    currencyId: null,
    currency: null,
    balance: null,
    balanceKind: null,
    balanceDate: null,
    balanceUpdatedAt: null,
    cardFrame: null,
    cardIssuer: null,
    hasLinkedTransfers: false,
    hasTransactions: false,
    lastTransactionDate: null,
    createdAt: timestamp,
    updatedAt: timestamp,
});

const accounts: IAccountResponse[] = [makeAccount("acc-1", "Checking"), makeAccount("acc-2", "Savings")];

const categories: Category[] = [
    {
        id: "cat-food",
        userId: null,
        name: "Food",
        color: "#16a34a",
        isSystem: false,
        createdAt: timestamp,
        updatedAt: timestamp,
    },
];

const existingRule: IRule = {
    id: "rule-1",
    name: "Lunch rule",
    priority: 1,
    stopOnMatch: true,
    isActive: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    conditions: [{ id: "cond-1", field: "description", operator: "contains", value: "lunchspot", position: 0 }],
    actions: [{ id: "action-1", type: "set_category", value: "cat-food", position: 0 }],
};

const preview = (wouldChangeCount: number): RulePreviewResponse => ({
    matchCount: wouldChangeCount + 1,
    wouldChangeCount,
    alreadyTargetCount: 1,
    counts: { all: wouldChangeCount + 1, uncategorized: 0, categorized: wouldChangeCount + 1 },
    items: [],
    page: 1,
    totalPages: 1,
});

const mounted: VueWrapper[] = [];

const mountDialog = async (overrides: Partial<RuleEditorDialogState> = {}) => {
    dialog.state = { visible: true, mode: "create", rule: null, prefillTransaction: null, openCount: 1, ...overrides };
    const wrapper = await mountSuspended(RuleEditorDialog);
    mounted.push(wrapper);
    await flushPromises();
    return wrapper;
};

// The dialog teleports to <body>, so its controls are read from the document.
const valueInput = (): HTMLInputElement => {
    const input = document.querySelector<HTMLInputElement>('input[id^="rule-condition-value-"]');
    if (!input) throw new Error("no value input");
    return input;
};

const nameInput = (): HTMLInputElement => {
    const input = document.getElementById("rule-name");
    if (!(input instanceof HTMLInputElement)) throw new Error("no name input");
    return input;
};

const removeButtons = () =>
    Array.from(document.body.querySelectorAll<HTMLButtonElement>('button[aria-label="Remove condition"]'));

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

const typeInto = async (input: HTMLInputElement, text: string) => {
    input.value = text;
    input.dispatchEvent(new Event("input"));
    await flushPromises();
};

const rowAt = (wrapper: VueWrapper, index: number) => {
    const row = wrapper.findAllComponents(RuleConditionRow)[index];
    if (!row) throw new Error(`no condition row ${index}`);
    return row;
};

const rowSelect = (wrapper: VueWrapper, rowIndex: number, selectIndex: number) => {
    const select = rowAt(wrapper, rowIndex).findAllComponents(Select)[selectIndex];
    if (!select) throw new Error(`no select ${selectIndex} in row ${rowIndex}`);
    return select;
};

const chooseCategory = (wrapper: VueWrapper, categoryId: string) =>
    wrapper.findComponent(CategorySelect).vm.$emit("update:modelValue", categoryId);

const untickApply = (wrapper: VueWrapper) => wrapper.findComponent(Checkbox).vm.$emit("update:modelValue", false);

/** A complete create form: a typed description and a category. */
const fillComplete = async (wrapper: VueWrapper) => {
    await typeInto(valueInput(), "lunchspot");
    chooseCategory(wrapper, "cat-food");
    await flushPromises();
};

beforeEach(() => {
    api.createRule.mockReset();
    api.createRule.mockResolvedValue({ rule: existingRule, appliedCount: null });
    api.updateRule.mockReset();
    api.updateRule.mockResolvedValue({ rule: existingRule, appliedCount: null });
    dialog.close.mockReset();
    previewState.value = null;
    previewState.checking = false;
    listState.items = [];
    listState.total = 0;
});

afterEach(() => {
    for (const wrapper of mounted.splice(0)) wrapper.unmount();
});

describe("RuleEditorDialog", () => {
    it("resets the operator and value when the field changes", async () => {
        const wrapper = await mountDialog();
        await typeInto(valueInput(), "lunchspot");

        rowSelect(wrapper, 0, 0).vm.$emit("update:modelValue", "amount");
        await flushPromises();

        expect(rowSelect(wrapper, 0, 1).props("modelValue")).toBe("greaterThan");
        expect(valueInput().value).toBe("");
    });

    it("disables the remove button on the only row and enables it once there are two", async () => {
        await mountDialog();
        expect(removeButtons()[0]?.disabled).toBe(true);

        await clickButton("Add condition");

        expect(removeButtons().map((button) => button.disabled)).toEqual([false, false]);
    });

    it("follows the auto name until typed, and goes back to it when cleared", async () => {
        await mountDialog();
        expect(nameInput().placeholder).toBe("Description contains");

        await typeInto(valueInput(), "lunchspot");
        expect(nameInput().placeholder).toContain("lunchspot");
        expect(nameInput().value).toBe("");

        await typeInto(nameInput(), "Lunch");
        expect(nameInput().value).toBe("Lunch");

        await typeInto(nameInput(), "");
        expect(nameInput().value).toBe("");
        expect(nameInput().placeholder).toContain("lunchspot");
    });

    it("labels the create button with the apply count when the box is ticked", async () => {
        previewState.value = preview(3);
        const wrapper = await mountDialog();
        await typeInto(valueInput(), "lunchspot");
        expect(buttonLabelled("Create rule")).toBeDefined();

        chooseCategory(wrapper, "cat-food");
        await flushPromises();
        expect(buttonLabelled("Create and apply to 3")).toBeDefined();

        untickApply(wrapper);
        await flushPromises();
        expect(buttonLabelled("Create rule")).toBeDefined();
    });

    it("labels the save button for an edit with the apply box ticked and unticked", async () => {
        previewState.value = preview(3);
        const wrapper = await mountDialog({ mode: "edit", rule: existingRule });
        expect(buttonLabelled("Save and apply to 3")).toBeDefined();

        untickApply(wrapper);
        await flushPromises();
        expect(buttonLabelled("Save changes")).toBeDefined();
    });

    it("sends the apply selection when the box is ticked", async () => {
        previewState.value = preview(3);
        const wrapper = await mountDialog();
        await fillComplete(wrapper);

        await clickButton("Create and apply to 3");

        expect(api.createRule).toHaveBeenCalledTimes(1);
        const dto = api.createRule.mock.calls[0]?.[0];
        expect(dto.apply).toEqual({ mode: "allExcept", ids: [] });
        expect(dto.actions).toEqual([{ type: "set_category", value: "cat-food" }]);
        expect(dialog.close).toHaveBeenCalled();
    });

    it("sends no apply selection when the box is unticked", async () => {
        previewState.value = preview(3);
        const wrapper = await mountDialog();
        await fillComplete(wrapper);
        untickApply(wrapper);
        await flushPromises();

        await clickButton("Create rule");

        expect(api.createRule).toHaveBeenCalledTimes(1);
        const dto = api.createRule.mock.calls[0]?.[0];
        expect(dto.apply).toBeUndefined();
        expect(dialog.close).toHaveBeenCalled();
    });

    it("shows an API error and keeps the dialog open", async () => {
        api.createRule.mockRejectedValueOnce({ response: { data: { message: "Rule name is already used" } } });
        const wrapper = await mountDialog();
        await fillComplete(wrapper);

        await clickButton("Create rule");

        expect(document.body.textContent).toContain("Rule name is already used");
        expect(dialog.close).not.toHaveBeenCalled();
        expect(buttonLabelled("Create rule")).toBeDefined();
    });

    it("shows a disabled apply box unticked", async () => {
        const wrapper = await mountDialog();

        const checkbox = wrapper.findComponent(Checkbox);
        expect(checkbox.props("disabled")).toBe(true);
        expect(checkbox.props("modelValue")).toBe(false);
    });

    it("caps the name at the rule name limit", async () => {
        await mountDialog();

        expect(nameInput().maxLength).toBe(RULE_NAME_MAX_LENGTH);
    });

    it("drops the count from the primary and still sends apply while a new count is checking", async () => {
        previewState.value = preview(3);
        previewState.checking = true;
        const wrapper = await mountDialog();
        await fillComplete(wrapper);

        expect(buttonLabelled("Create and apply to 3")).toBeUndefined();

        await clickButton("Create and apply");

        expect(api.createRule).toHaveBeenCalledTimes(1);
        expect(api.createRule.mock.calls[0]?.[0].apply).toEqual({ mode: "allExcept", ids: [] });
    });

    it("keeps the box enabled and ticked while checking, even when the last count matched nothing", async () => {
        previewState.value = preview(0);
        previewState.checking = true;
        const wrapper = await mountDialog();
        await fillComplete(wrapper);

        const checkbox = wrapper.findComponent(Checkbox);
        expect(checkbox.props("disabled")).toBe(false);
        expect(checkbox.props("modelValue")).toBe(true);

        await clickButton("Create and apply");

        expect(api.createRule.mock.calls[0]?.[0].apply).toEqual({ mode: "allExcept", ids: [] });
    });

    it("focuses the first empty value on save and does not send", async () => {
        await mountDialog();

        await clickButton("Create rule");

        expect(api.createRule).not.toHaveBeenCalled();
        expect(document.body.textContent).toContain("Enter a value");
        expect(document.activeElement).toBe(valueInput());
    });
});

describe("RuleEditorDialog started from a transaction", () => {
    it("selects the prefilled text and shows the hint", async () => {
        const transaction = {
            id: "tx-1",
            description: "LUNCHSPOT PAY",
            categoryId: "cat-food",
        } as unknown as ITransactionResponse;

        await mountDialog({ prefillTransaction: transaction });

        expect(valueInput().value).toBe("LUNCHSPOT PAY");
        expect(valueInput().selectionStart).toBe(0);
        expect(valueInput().selectionEnd).toBe("LUNCHSPOT PAY".length);
        expect(document.body.textContent).toContain("From the transaction you started on");
    });
});

describe("RuleEditorDialog review step", () => {
    const rowItem = (id: string): RulePreviewItem => ({
        id,
        description: `Coffee ${id}`,
        transactionDate: "2026-10-01",
        amount: 4,
        type: "expense",
        transferDirection: null,
        currencyCode: "USD",
        accountName: "Checking",
        category: null,
    });

    /** Opens the review from the apply box with three would-change rows; the checkbox at index 0 is the header. */
    const openReviewWithThree = async () => {
        previewState.value = preview(3);
        listState.items = [rowItem("a"), rowItem("b"), rowItem("c")];
        listState.total = 3;
        const wrapper = await mountDialog();
        await fillComplete(wrapper);
        await clickButton("Review");
        return wrapper;
    };

    const reviewRowCheckbox = (wrapper: VueWrapper, index: number) => {
        const checkbox = wrapper.findComponent(RuleReview).findAllComponents(Checkbox)[index];
        if (!checkbox) throw new Error(`no review checkbox ${index}`);
        return checkbox;
    };

    const clickBackToRule = async () => {
        const back = document.querySelector<HTMLButtonElement>('button[aria-label="Back to the rule"]');
        if (!back) throw new Error("no back button");
        back.click();
        await flushPromises();
    };

    it("opens the review in the same dialog with the save labelled for the selection", async () => {
        const wrapper = await openReviewWithThree();

        expect(document.body.textContent).toContain('Apply "');
        expect(wrapper.findComponent(RuleReview).exists()).toBe(true);
        expect(buttonLabelled("Save and apply to 3")).toBeDefined();
    });

    it("moves focus to the back arrow when the review opens, and back to Review when it closes", async () => {
        await openReviewWithThree();

        expect(document.activeElement?.getAttribute("aria-label")).toBe("Back to the rule");

        await clickBackToRule();

        expect(document.activeElement?.id).toBe("rule-review-open");
    });

    it("keeps the unticked row through back and the form title reads of", async () => {
        const wrapper = await openReviewWithThree();

        reviewRowCheckbox(wrapper, 2).vm.$emit("update:modelValue", false);
        await flushPromises();
        expect(buttonLabelled("Save and apply to 2")).toBeDefined();

        await clickBackToRule();

        expect(wrapper.findComponent(RuleReview).exists()).toBe(false);
        expect(document.body.textContent).toContain("Also apply to 2 of 3 existing transactions");
    });

    it("resets the exclusions when a condition changes", async () => {
        const wrapper = await openReviewWithThree();
        reviewRowCheckbox(wrapper, 2).vm.$emit("update:modelValue", false);
        await flushPromises();
        await clickBackToRule();

        await typeInto(valueInput(), "lunchspot2");

        expect(document.body.textContent).toContain("Also apply to 3 existing transactions");
        expect(document.body.textContent).not.toContain("of 3 existing transactions");
    });

    it("saves from the review with the excluded id and no other ids", async () => {
        const wrapper = await openReviewWithThree();
        reviewRowCheckbox(wrapper, 2).vm.$emit("update:modelValue", false);
        await flushPromises();

        await clickButton("Save and apply to 2");

        expect(api.createRule).toHaveBeenCalledTimes(1);
        expect(api.createRule.mock.calls[0]?.[0].apply).toEqual({ mode: "allExcept", ids: ["b"] });
        expect(dialog.close).toHaveBeenCalled();
    });
});
