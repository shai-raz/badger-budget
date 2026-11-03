<script setup lang="ts">
/**
 * The rule editor: create a rule, create one from a transaction, or edit an existing rule. Mounted once in
 * layouts/app.vue and opened through useRuleEditorDialog(). The layout keys it on openCount, so every open
 * starts from fresh values.
 *
 * The "Also apply" box saves and applies in one request, so a failed apply leaves no rule behind.
 */
import { useToast } from "primevue/usetoast";
import { RULE_NAME_MAX_LENGTH } from "@badger/shared-data";
import type { ApplyRuleSelection, Category } from "@badger/types";
import CategorySelect from "~/components/categories/CategorySelect.vue";
import { getApiErrorMessage } from "~/utils/apiError";
import { selectAll, selectedCount, toApplySelection, type RuleSelection } from "~/utils/ruleReviewSelection";
import { useSaveRuleMutation } from "~/composables/rules/useRules";
import { useRulePreviewCount } from "~/composables/rules/useRulePreview";
import {
    applyBoxCopy,
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
    type DraftErrors,
    type EditorCondition,
    type RuleEditorDraft,
} from "~/utils/ruleEditor";
import RuleConditionRow from "./RuleConditionRow.vue";
import RuleReview from "./RuleReview.vue";

const TRANSACTION_HINT = 'From the transaction you started on. Shorten it to match more, for example "starbucks".';
const CATEGORY_FIELD_ID = "rule-category";
const BACK_TO_RULE_LABEL = "Back to the rule";
const REVIEW_BUTTON_ID = "rule-review-open";

const valueFieldId = (key: string) => `rule-condition-value-${key}`;

const { state, close } = useRuleEditorDialog();
const toast = useToast();

const { data: accounts } = useGetAccounts();
const { data: categories } = useGetCategoriesQuery();
const saveRule = useSaveRuleMutation();

const isEdit = state.value.mode === "edit";
const editingId = isEdit ? state.value.rule?.id : undefined;
const prefill = state.value.prefillTransaction;
const transactionHint = prefill ? TRANSACTION_HINT : undefined;

const accountNameOf = (id: string) => accounts.value?.find((account) => account.id === id)?.name;
const formatContext = { accountName: accountNameOf };

const initialDraft = (): RuleEditorDraft => {
    const rule = state.value.rule;
    if (isEdit && rule) return draftFromRule(rule, formatContext);
    if (prefill) return draftFromTransaction(prefill);
    return emptyDraft();
};

const draft = ref<RuleEditorDraft>(initialDraft());
const { preview, checking } = useRulePreviewCount(draft);

const applyTicked = ref(true);
/** Which would-change transactions the save applies. The Review step edits it; a changed condition resets it. */
const selection = ref<RuleSelection>(selectAll());
const view = ref<"form" | "review">("form");
const apiError = ref<string | null>(null);
const submitted = ref(false);
/** DOM ids of the fields the user has left, so their errors show before save. */
const touched = reactive(new Set<string>());
const busy = computed(() => saveRule.isPending.value);

const errors = computed<DraftErrors>(() => validateDraft(draft.value));
const categoryName = computed(
    () =>
        ((categories.value ?? []) as Category[]).find((category) => category.id === draft.value.categoryId)?.name ??
        "this category",
);

const shownError = (fieldId: string, message: string | undefined) =>
    message && (submitted.value || touched.has(fieldId)) ? message : undefined;
const conditionError = (key: string) => shownError(valueFieldId(key), errors.value.conditions[key]);
const categoryError = computed(() => shownError(CATEGORY_FIELD_ID, errors.value.category));

const markTouched = (fieldId: string) => {
    touched.add(fieldId);
};

const autoName = computed(() => displayName({ ...draft.value, nameTouched: false }, formatContext));

// The name input is empty until the user types; the auto name sits in its placeholder.
const nameModel = computed({
    get: () => (draft.value.nameTouched ? draft.value.name : ""),
    set: (value: string) => {
        draft.value = setName(draft.value, value);
    },
});

const replaceConditions = (conditions: EditorCondition[]) => {
    draft.value = { ...draft.value, conditions };
};
const updateCondition = (key: string, next: EditorCondition) =>
    replaceConditions(draft.value.conditions.map((condition) => (condition.key === key ? next : condition)));
const removeCondition = (key: string) =>
    replaceConditions(draft.value.conditions.filter((condition) => condition.key !== key));
const addCondition = () => replaceConditions([...draft.value.conditions, newCondition()]);

const categoryModel = computed<string | null>({
    get: () => draft.value.categoryId,
    set: (categoryId) => {
        draft.value = { ...draft.value, categoryId };
    },
});

const wouldChangeTotal = computed(() => preview.value?.wouldChangeCount ?? 0);
/** How many the save applies: the would-change count less the rows unticked in Review. */
const selectedTotal = computed(() => selectedCount(selection.value, wouldChangeTotal.value));
const partialSelection = computed(() => selectedTotal.value < wouldChangeTotal.value);

const applyCopy = computed(() => {
    const copy = applyBoxCopy({
        complete: isDraftComplete(draft.value),
        checking: checking.value,
        preview: preview.value,
        categoryName: categoryName.value,
    });
    if (copy.disabled || !partialSelection.value) return copy;
    return {
        ...copy,
        title: `Also apply to ${selectedTotal.value} of ${wouldChangeTotal.value} existing transactions`,
    };
});

// Applying needs the box ticked. While a count is being checked the box decides alone, since the count on screen
// may be stale; save recomputes the set anyway. Otherwise the box must be enabled and at least one transaction changes.
const applying = computed(() => {
    if (!applyTicked.value) return false;
    if (checking.value) return true;
    return !applyCopy.value.disabled && selectedTotal.value > 0;
});

// The primary states the count only once it is current.
const primaryLabel = computed(() =>
    editorPrimaryLabel({
        mode: isEdit ? "edit" : "create",
        applying: applying.value,
        count: checking.value ? null : selectedTotal.value,
    }),
);

// Review names what the save applies to; with nothing ticked it is the plain save.
const reviewPrimaryLabel = computed(() => {
    if (!applying.value) return isEdit ? "Save changes" : "Create rule";
    return checking.value ? "Save and apply" : `Save and apply to ${selectedTotal.value}`;
});

const dialogHeader = computed(() => {
    if (view.value === "review") return `Apply "${displayName(draft.value, formatContext)}"`;
    return isEdit ? "Edit rule" : "New rule";
});

// The review lists what the draft would change, so it takes the draft as the API sends it.
const reviewDraft = computed(() => toRuleDraft(draft.value));
const reviewCategory = computed(() => {
    const category = ((categories.value ?? []) as Category[]).find((item) => item.id === draft.value.categoryId);
    return { name: categoryName.value, color: category?.color ?? "", icon: category?.icon ?? null };
});

// A changed condition or category changes which transactions match, so the exclusions start over.
watch(
    () => draftMatchKey(draft.value),
    () => {
        selection.value = selectAll();
    },
);

const openReview = async () => {
    // Reviewing is for applying, so the box is ticked when the review opens.
    applyTicked.value = true;
    view.value = "review";
    // The Review button unmounts with the form, so focus moves to the review's back arrow.
    await nextTick();
    document.querySelector<HTMLElement>(`[aria-label="${BACK_TO_RULE_LABEL}"]`)?.focus();
};

const backToForm = async () => {
    view.value = "form";
    // The back arrow unmounts with the review, so focus returns to the Review button that opened it.
    await nextTick();
    (document.getElementById(REVIEW_BUTTON_ID) ?? document.getElementById("rule-name"))?.focus();
};

/** The first field with an error, in the order the form shows them. */
const firstErrorFieldId = (): string | null => {
    for (const condition of draft.value.conditions) {
        if (errors.value.conditions[condition.key]) return valueFieldId(condition.key);
    }
    return errors.value.category ? CATEGORY_FIELD_ID : null;
};

const focusField = (fieldId: string) => {
    const element = document.getElementById(fieldId);
    if (!element) return;
    const target = element.matches("input, button, [tabindex]")
        ? element
        : element.querySelector<HTMLElement>("input, button, [tabindex]");
    target?.focus();
};

const handleSave = async () => {
    submitted.value = true;
    const invalidField = firstErrorFieldId();
    if (invalidField) {
        focusField(invalidField);
        return;
    }

    apiError.value = null;
    const apply: ApplyRuleSelection | undefined = applying.value ? toApplySelection(selection.value) : undefined;
    const dto = {
        name: displayName(draft.value, formatContext),
        ...toRuleDraft(draft.value),
        stopOnMatch: draft.value.stopOnMatch,
        apply,
    };
    const targetCategory = categoryName.value;

    try {
        const { appliedCount } = editingId
            ? await saveRule.mutateAsync({ id: editingId, dto })
            : await saveRule.mutateAsync({ dto });
        close();
        toast.add({
            severity: "success",
            summary: "Rule saved",
            detail:
                appliedCount !== null && appliedCount > 0
                    ? `Moved ${appliedCount} transactions to ${targetCategory}.`
                    : undefined,
            life: 3000,
        });
    } catch (error) {
        apiError.value = getApiErrorMessage(error, "Could not save the rule");
    }
};

const onVisibleChange = (value: boolean) => {
    if (!value) close();
};

// A rule started from a transaction selects its prefilled text, so typing replaces it at once.
onMounted(() => {
    if (!prefill) return;
    nextTick(() => {
        const first = draft.value.conditions[0];
        const input = first ? document.getElementById(valueFieldId(first.key)) : null;
        if (input instanceof HTMLInputElement) input.select();
    });
});
</script>

<template>
    <SharedFormDialog
        :visible="state.visible"
        :header="dialogHeader"
        :initial-focus="view === 'review' || isEdit ? 'dialog' : 'field'"
        :busy="busy"
        :api-error="apiError"
        :save-label="view === 'review' ? reviewPrimaryLabel : primaryLabel"
        :back-label="view === 'review' ? BACK_TO_RULE_LABEL : undefined"
        :cancel-label="view === 'review' ? 'Back' : undefined"
        width="45rem"
        @update:visible="onVisibleChange"
        @save="handleSave"
        @back="backToForm"
    >
        <template v-if="view === 'form'">
            <div class="flex flex-col gap-1">
                <label
                    for="rule-name"
                    class="text-sm font-medium text-surface-700 dark:text-surface-200"
                    >Name</label
                >
                <InputText
                    id="rule-name"
                    v-model="nameModel"
                    :placeholder="autoName || 'Name this rule'"
                    :maxlength="RULE_NAME_MAX_LENGTH"
                    class="w-full"
                />
                <small class="text-sm text-muted-color"
                    >Filled in from the first condition until you type your own.</small
                >
            </div>

            <div class="flex flex-col gap-2">
                <h3 class="text-sm font-medium text-surface-700 dark:text-surface-200">When all of these match</h3>
                <template
                    v-for="(condition, index) in draft.conditions"
                    :key="condition.key"
                >
                    <div
                        v-if="index > 0"
                        class="text-center text-xs font-semibold tracking-wide text-muted-color sm:hidden"
                    >
                        AND
                    </div>
                    <RuleConditionRow
                        :condition="condition"
                        :accounts="accounts ?? []"
                        :removable="draft.conditions.length > 1"
                        :error="conditionError(condition.key)"
                        :autofocus="index === 0 && !isEdit"
                        :hint="index === 0 ? transactionHint : undefined"
                        @update:condition="updateCondition(condition.key, $event)"
                        @remove="removeCondition(condition.key)"
                        @blur="markTouched(valueFieldId(condition.key))"
                    />
                </template>
                <div>
                    <Button
                        label="Add condition"
                        icon="pi pi-plus"
                        text
                        size="small"
                        @click="addCondition"
                    />
                </div>
            </div>

            <div class="flex flex-col gap-2">
                <h3 class="text-sm font-medium text-surface-700 dark:text-surface-200">Then</h3>
                <div class="flex flex-col gap-1">
                    <span class="text-sm font-medium text-surface-700 dark:text-surface-200">Set category to</span>
                    <CategorySelect
                        id="rule-category"
                        v-model="categoryModel"
                        placeholder="Choose a category"
                        :invalid="!!categoryError"
                        :aria-describedby="categoryError ? 'rule-category-error' : undefined"
                        @blur="markTouched(CATEGORY_FIELD_ID)"
                    />
                    <small
                        v-if="categoryError"
                        id="rule-category-error"
                        class="block text-sm text-red-500"
                        >{{ categoryError }}</small
                    >
                </div>

                <div class="flex items-center justify-between gap-3">
                    <div class="flex min-w-0 flex-col gap-0.5">
                        <label
                            for="rule-stop-on-match"
                            class="cursor-pointer text-sm font-medium text-surface-700 dark:text-surface-200"
                            >Stop after this rule</label
                        >
                        <small class="text-sm text-muted-color"
                            >Rules below this one won't run on transactions it matches.</small
                        >
                    </div>
                    <ToggleSwitch
                        v-model="draft.stopOnMatch"
                        input-id="rule-stop-on-match"
                        class="shrink-0"
                    />
                </div>
            </div>

            <div class="flex flex-col gap-2 rounded-lg border border-surface-200 p-3 dark:border-surface-700">
                <div class="flex items-start gap-3">
                    <Checkbox
                        :model-value="applyTicked && !applyCopy.disabled"
                        input-id="rule-apply"
                        :binary="true"
                        :disabled="applyCopy.disabled"
                        @update:model-value="applyTicked = $event"
                    />
                    <div class="flex min-w-0 flex-1 flex-col gap-0.5">
                        <label
                            for="rule-apply"
                            class="text-sm font-medium"
                            :class="
                                applyCopy.disabled
                                    ? 'cursor-default text-muted-color'
                                    : 'cursor-pointer text-surface-700 dark:text-surface-200'
                            "
                            >{{ applyCopy.title }}</label
                        >
                        <small class="text-sm text-muted-color">{{ applyCopy.sub }}</small>
                    </div>
                    <Button
                        v-if="!applyCopy.disabled"
                        :id="REVIEW_BUTTON_ID"
                        label="Review"
                        icon="pi pi-list"
                        severity="secondary"
                        outlined
                        size="small"
                        class="shrink-0"
                        @click="openReview"
                    />
                </div>
            </div>
        </template>
        <RuleReview
            v-else
            v-model:selection="selection"
            :draft="reviewDraft"
            :category="reviewCategory"
        />
    </SharedFormDialog>
</template>
