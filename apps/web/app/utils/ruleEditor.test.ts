import type { IRule, ITransactionResponse, RulePreviewResponse } from "@badger/types";
import { describe, expect, it } from "vitest";

import {
    applyBoxCopy,
    changeConditionField,
    displayName,
    draftFromRule,
    draftFromTransaction,
    draftMatchKey,
    editorPrimaryLabel,
    emptyDraft,
    isDraftComplete,
    newCondition,
    setName,
    toRuleDraft,
    validateDraft,
    type RuleEditorDraft,
} from "./ruleEditor";

const preview = (overrides: Partial<RulePreviewResponse> = {}): RulePreviewResponse => ({
    matchCount: 12,
    wouldChangeCount: 9,
    alreadyTargetCount: 3,
    counts: { all: 12, uncategorized: 9, categorized: 3 },
    items: [],
    page: 1,
    totalPages: 1,
    ...overrides,
});

const completeDraft = (): RuleEditorDraft => ({
    ...emptyDraft(),
    conditions: [{ ...newCondition("description"), value: "starbucks" }],
    categoryId: "cat-coffee",
});

const ruleFixture = (overrides: Partial<IRule> = {}): IRule => ({
    id: "rule-1",
    name: "Description contains starbucks",
    priority: 1,
    stopOnMatch: false,
    isActive: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    conditions: [{ id: "cond-1", field: "description", operator: "contains", value: "starbucks", position: 0 }],
    actions: [{ id: "act-1", type: "set_category", value: "cat-coffee", position: 0 }],
    ...overrides,
});

describe("newCondition and changeConditionField", () => {
    it("starts description rows on the first operator for the field", () => {
        const condition = newCondition("description");
        expect(condition).toMatchObject({ field: "description", operator: "contains", value: "" });
    });

    it("gives every new condition a distinct key", () => {
        expect(newCondition().key).not.toBe(newCondition().key);
    });

    it("resets operator and value when the field changes", () => {
        const amount = changeConditionField({ ...newCondition(), value: "starbucks" }, "amount");
        expect(amount).toMatchObject({ field: "amount", operator: "greaterThan", value: "" });
    });
});

describe("emptyDraft", () => {
    it("has one description-contains condition, no category and stop off", () => {
        const draft = emptyDraft();
        expect(draft.conditions).toHaveLength(1);
        expect(draft.conditions[0]).toMatchObject({ field: "description", operator: "contains" });
        expect(draft).toMatchObject({ name: "", nameTouched: false, categoryId: null, stopOnMatch: false });
    });
});

describe("draftFromRule", () => {
    it("treats a name equal to the auto name as untouched", () => {
        const draft = draftFromRule(ruleFixture());
        expect(draft.nameTouched).toBe(false);
        expect(draft.categoryId).toBe("cat-coffee");
        expect(draft.conditions[0]).toMatchObject({ key: "cond-1", value: "starbucks" });
    });

    it("treats a hand-written name as touched", () => {
        const draft = draftFromRule(ruleFixture({ name: "Coffee runs" }));
        expect(draft.nameTouched).toBe(true);
        expect(draft.name).toBe("Coffee runs");
    });

    it("carries stopOnMatch across", () => {
        expect(draftFromRule(ruleFixture({ stopOnMatch: true })).stopOnMatch).toBe(true);
    });
});

describe("draftFromTransaction", () => {
    it("matches the full description and takes the transaction category", () => {
        const tx = { description: "STARBUCKS #1234 SEATTLE", categoryId: "cat-coffee" } as ITransactionResponse;
        const draft = draftFromTransaction(tx);
        expect(draft.conditions[0]).toMatchObject({
            field: "description",
            operator: "contains",
            value: "STARBUCKS #1234 SEATTLE",
        });
        expect(draft.categoryId).toBe("cat-coffee");
        expect(draft.nameTouched).toBe(false);
    });

    it("leaves the category empty when the transaction has none", () => {
        const tx = { description: "X", categoryId: null } as ITransactionResponse;
        expect(draftFromTransaction(tx).categoryId).toBeNull();
    });
});

describe("displayName and setName", () => {
    it("uses the auto name while untouched", () => {
        expect(displayName(completeDraft())).toBe("Description contains starbucks");
    });

    it("uses the typed name once touched", () => {
        expect(displayName(setName(completeDraft(), "  Coffee  "))).toBe("Coffee");
    });

    it("hands the auto name back when the typed name is cleared", () => {
        const cleared = setName(setName(completeDraft(), "Coffee"), "   ");
        expect(cleared.nameTouched).toBe(false);
        expect(displayName(cleared)).toBe("Description contains starbucks");
    });
});

describe("validateDraft", () => {
    it("asks for a value on text conditions", () => {
        const condition = newCondition("description");
        const draft = { ...completeDraft(), conditions: [condition] };
        expect(validateDraft(draft).conditions[condition.key]).toBe("Enter a value");
    });

    it("accepts whole and two-decimal amounts only", () => {
        const amountError = (value: string) => {
            const condition = { ...newCondition("amount"), value };
            return validateDraft({ ...completeDraft(), conditions: [condition] }).conditions[condition.key];
        };
        expect(amountError("12")).toBeUndefined();
        expect(amountError("12.5")).toBeUndefined();
        expect(amountError("12.50")).toBeUndefined();
        expect(amountError("12.555")).toBe("Enter a number");
        expect(amountError("-3")).toBe("Enter a number");
        expect(amountError("")).toBe("Enter a number");
    });

    it("asks for an account and a valid type", () => {
        const account = newCondition("account");
        const type = newCondition("type");
        const errors = validateDraft({ ...completeDraft(), conditions: [account, type] }).conditions;
        expect(errors[account.key]).toBe("Choose an account");
        expect(errors[type.key]).toBe("Choose a type");

        const withType = { ...completeDraft(), conditions: [{ ...type, value: "expense" }] };
        expect(validateDraft(withType).conditions[type.key]).toBeUndefined();
    });

    it("asks for a category", () => {
        expect(validateDraft({ ...completeDraft(), categoryId: null }).category).toBe("Choose a category");
    });
});

describe("isDraftComplete and toRuleDraft", () => {
    it("is complete when every condition and the category are valid", () => {
        expect(isDraftComplete(completeDraft())).toBe(true);
        expect(isDraftComplete(emptyDraft())).toBe(false);
    });

    it("builds the API payload with trimmed values and a set_category action", () => {
        const draft = { ...completeDraft(), conditions: [{ ...newCondition("description"), value: "  starbucks  " }] };
        expect(toRuleDraft(draft)).toEqual({
            conditions: [{ field: "description", operator: "contains", value: "starbucks" }],
            actions: [{ type: "set_category", value: "cat-coffee" }],
        });
    });
});

describe("draftMatchKey", () => {
    it("changes with the conditions or the category, and ignores the name", () => {
        const base = completeDraft();
        expect(draftMatchKey(setName(base, "Coffee"))).toBe(draftMatchKey(base));
        expect(draftMatchKey({ ...base, categoryId: "cat-food" })).not.toBe(draftMatchKey(base));
        const tea = { ...newCondition("description"), value: "tea" };
        expect(draftMatchKey({ ...base, conditions: [tea] })).not.toBe(draftMatchKey(base));
    });
});

describe("editorPrimaryLabel", () => {
    it("labels the save when not applying", () => {
        expect(editorPrimaryLabel({ mode: "create", applying: false, count: null })).toBe("Create rule");
        expect(editorPrimaryLabel({ mode: "edit", applying: false, count: 4 })).toBe("Save changes");
    });

    it("labels the apply with its count, or without one while checking", () => {
        expect(editorPrimaryLabel({ mode: "create", applying: true, count: 3 })).toBe("Create and apply to 3");
        expect(editorPrimaryLabel({ mode: "edit", applying: true, count: 3 })).toBe("Save and apply to 3");
        expect(editorPrimaryLabel({ mode: "create", applying: true, count: null })).toBe("Create and apply");
        expect(editorPrimaryLabel({ mode: "edit", applying: true, count: null })).toBe("Save and apply");
    });
});

describe("applyBoxCopy", () => {
    it("is disabled until the conditions are finished", () => {
        expect(applyBoxCopy({ complete: false, preview: preview(), categoryName: "Coffee" })).toEqual({
            title: "Also apply to existing transactions",
            sub: "Finish the conditions to see matches.",
            disabled: true,
        });
    });

    it("is disabled before any count when none is being checked", () => {
        expect(applyBoxCopy({ complete: true, preview: null, categoryName: "Coffee" }).disabled).toBe(true);
    });

    it("stays enabled on the first count while it is checking", () => {
        expect(applyBoxCopy({ complete: true, checking: true, preview: null, categoryName: "Coffee" })).toEqual({
            title: "Also apply to existing transactions",
            sub: "Checking matches...",
            disabled: false,
        });
    });

    it("keeps the last count and stays enabled while a newer count loads", () => {
        const copy = applyBoxCopy({ complete: true, checking: true, preview: preview(), categoryName: "Coffee" });
        expect(copy).toEqual({
            title: "Also apply to 9 existing transactions",
            sub: "12 match, 3 already have Coffee",
            disabled: false,
        });
    });

    it("stays enabled while a newer count loads, even if the last count matched nothing", () => {
        const copy = applyBoxCopy({
            complete: true,
            checking: true,
            preview: preview({ matchCount: 0, wouldChangeCount: 0, alreadyTargetCount: 0 }),
            categoryName: "Coffee",
        });
        expect(copy.disabled).toBe(false);
    });

    it("is disabled when nothing matches", () => {
        const copy = applyBoxCopy({
            complete: true,
            preview: preview({ matchCount: 0, wouldChangeCount: 0, alreadyTargetCount: 0 }),
            categoryName: "Coffee",
        });
        expect(copy).toEqual({
            title: "Also apply to existing transactions",
            sub: "No existing transactions match yet.",
            disabled: true,
        });
    });

    it("is disabled when every match already has the category", () => {
        const copy = applyBoxCopy({
            complete: true,
            preview: preview({ matchCount: 5, wouldChangeCount: 0, alreadyTargetCount: 5 }),
            categoryName: "Coffee",
        });
        expect(copy.sub).toBe("All 5 matching transactions already have Coffee.");
        expect(copy.disabled).toBe(true);
    });

    it("offers to apply to the changing count", () => {
        const copy = applyBoxCopy({ complete: true, preview: preview(), categoryName: "Coffee" });
        expect(copy).toEqual({
            title: "Also apply to 9 existing transactions",
            sub: "12 match, 3 already have Coffee",
            disabled: false,
        });
    });

    it("uses singular forms for one", () => {
        const copy = applyBoxCopy({
            complete: true,
            preview: preview({ matchCount: 2, wouldChangeCount: 1, alreadyTargetCount: 1 }),
            categoryName: "Coffee",
        });
        expect(copy.title).toBe("Also apply to 1 existing transaction");
        expect(copy.sub).toBe("2 match, 1 already has Coffee");
    });
});
