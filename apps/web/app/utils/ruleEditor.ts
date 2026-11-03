import {
    RULE_FIELD_OPERATORS,
    isTransactionType,
    type RuleConditionField,
    type RuleOperator,
} from "@badger/shared-data";
import { autoRuleName, ruleCategoryId, type RuleFormatContext } from "@badger/utils";
import type { IRule, ITransactionResponse, RulePreviewResponse, RuleDraft } from "@badger/types";

/** One condition row in the editor. `key` is stable across edits so rows keep their focus and errors. */
export interface EditorCondition {
    key: string;
    field: RuleConditionField;
    operator: RuleOperator;
    /** Amount values stay strings while typing; an account holds an account id; a type holds a TransactionType or "". */
    value: string;
}

export interface RuleEditorDraft {
    name: string;
    /** False while the name follows the auto-generated one from the conditions. */
    nameTouched: boolean;
    conditions: EditorCondition[];
    categoryId: string | null;
    stopOnMatch: boolean;
}

export interface DraftErrors {
    /** Error text per condition key. */
    conditions: Record<string, string>;
    category?: string;
}

export interface ApplyBoxCopy {
    title: string;
    sub: string;
    disabled: boolean;
}

export interface EditorPrimaryLabelInput {
    mode: "create" | "edit";
    applying: boolean;
    /** Transactions the save would change; null while the count is still being checked. */
    count: number | null;
}

export interface ApplyBoxInput {
    complete: boolean;
    preview: RulePreviewResponse | null;
    categoryName: string;
}

let keySequence = 0;

function nextKey(): string {
    keySequence += 1;
    return `new-${keySequence}`;
}

function plural(count: number, singular: string): string {
    return count === 1 ? singular : `${singular}s`;
}

/** Every field has at least one operator, so the fallback is only there to satisfy the array index type. */
function defaultOperator(field: RuleConditionField): RuleOperator {
    return RULE_FIELD_OPERATORS[field][0] ?? "equals";
}

const AMOUNT_PATTERN = /^\d+(\.\d{1,2})?$/;

/** A fresh condition for a field, with the default operator of that field and no value. */
export function newCondition(field: RuleConditionField = "description"): EditorCondition {
    return { key: nextKey(), field, operator: defaultOperator(field), value: "" };
}

/** Switching a field resets the operator and value, since the old ones may not apply to the new field. */
export function changeConditionField(condition: EditorCondition, field: RuleConditionField): EditorCondition {
    return { ...condition, field, operator: defaultOperator(field), value: "" };
}

/** A new rule: one description-contains condition, no category, stop off. */
export function emptyDraft(): RuleEditorDraft {
    return {
        name: "",
        nameTouched: false,
        conditions: [newCondition("description")],
        categoryId: null,
        stopOnMatch: false,
    };
}

/** Editing an existing rule. The name counts as typed only when it differs from the auto-generated one. */
export function draftFromRule(rule: IRule, ctx: RuleFormatContext = {}): RuleEditorDraft {
    return {
        name: rule.name,
        nameTouched: rule.name !== autoRuleName(rule.conditions, ctx),
        conditions: rule.conditions.map((condition) => ({
            key: condition.id,
            field: condition.field,
            operator: condition.operator,
            value: condition.value,
        })),
        categoryId: ruleCategoryId(rule),
        stopOnMatch: rule.stopOnMatch,
    };
}

/** Creating from a transaction: match its full description and set the category it already has. */
export function draftFromTransaction(tx: ITransactionResponse): RuleEditorDraft {
    return {
        name: "",
        nameTouched: false,
        conditions: [{ ...newCondition("description"), value: tx.description }],
        categoryId: tx.categoryId ?? null,
        stopOnMatch: false,
    };
}

/** The name the rule will be saved with: the typed one when there is one, otherwise the auto name. */
export function displayName(draft: RuleEditorDraft, ctx: RuleFormatContext = {}): string {
    const typed = draft.name.trim();
    if (draft.nameTouched && typed !== "") return typed;
    return autoRuleName(draft.conditions, ctx);
}

/** Typing a name marks it touched; clearing the box hands the name back to the auto name. */
export function setName(draft: RuleEditorDraft, name: string): RuleEditorDraft {
    return { ...draft, name, nameTouched: name.trim() !== "" };
}

export function validateDraft(draft: RuleEditorDraft): DraftErrors {
    const conditions: Record<string, string> = {};

    for (const condition of draft.conditions) {
        const value = condition.value.trim();
        switch (condition.field) {
            case "description":
            case "originalCategory":
                if (value === "") conditions[condition.key] = "Enter a value";
                break;
            case "amount":
                if (!AMOUNT_PATTERN.test(value)) conditions[condition.key] = "Enter a number";
                break;
            case "account":
                if (value === "") conditions[condition.key] = "Choose an account";
                break;
            case "type":
                if (!isTransactionType(value)) conditions[condition.key] = "Choose a type";
                break;
        }
    }

    const errors: DraftErrors = { conditions };
    if (!draft.categoryId) errors.category = "Choose a category";
    return errors;
}

/** True when the draft can be saved and previewed: every condition is valid and a category is chosen. */
export function isDraftComplete(draft: RuleEditorDraft): boolean {
    const errors = validateDraft(draft);
    return Object.keys(errors.conditions).length === 0 && errors.category === undefined;
}

/** The API payload for a draft: trimmed condition values and a set_category action. Call only on a complete draft. */
export function toRuleDraft(draft: RuleEditorDraft): RuleDraft {
    return {
        conditions: draft.conditions.map((condition) => ({
            field: condition.field,
            operator: condition.operator,
            value: condition.value.trim(),
        })),
        actions: [{ type: "set_category", value: draft.categoryId ?? "" }],
    };
}

/** Identifies what a preview is about, so review exclusions can reset when the conditions or category change. */
export function draftMatchKey(draft: RuleEditorDraft): string {
    return JSON.stringify([
        draft.conditions.map((condition) => [condition.field, condition.operator, condition.value.trim()]),
        draft.categoryId,
    ]);
}

export function editorPrimaryLabel({ mode, applying, count }: EditorPrimaryLabelInput): string {
    if (!applying) return mode === "create" ? "Create rule" : "Save changes";
    const verb = mode === "create" ? "Create" : "Save";
    if (count === null) return `${verb} and apply`;
    return `${verb} and apply to ${count}`;
}

/** Copy and enabled state for the "Also apply to existing transactions" box. */
export function applyBoxCopy({ complete, preview, categoryName }: ApplyBoxInput): ApplyBoxCopy {
    const idleTitle = "Also apply to existing transactions";

    if (!complete) {
        return { title: idleTitle, sub: "Finish the conditions to see matches.", disabled: true };
    }
    if (preview === null) {
        return { title: idleTitle, sub: "Checking matches...", disabled: true };
    }

    const total = preview.matchCount;
    if (total === 0) {
        return { title: idleTitle, sub: "No existing transactions match yet.", disabled: true };
    }
    if (preview.wouldChangeCount === 0) {
        return {
            title: idleTitle,
            sub: `All ${total} matching ${plural(total, "transaction")} already have ${categoryName}.`,
            disabled: true,
        };
    }

    const changing = preview.wouldChangeCount;
    const already = preview.alreadyTargetCount;
    return {
        title: `Also apply to ${changing} existing ${plural(changing, "transaction")}`,
        sub: `${total} ${total === 1 ? "match" : "matches"}, ${already} ${already === 1 ? "already has" : "already have"} ${categoryName}`,
        disabled: false,
    };
}
