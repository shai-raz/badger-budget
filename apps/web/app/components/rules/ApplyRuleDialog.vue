<script setup lang="ts">
/**
 * "Apply now…" from a rule's row: applies the rule to the existing transactions it would change, through the same
 * review as the editor. The page mounts it once and passes the rule in. Every open starts with all rows ticked,
 * and a rule whose matches already have its category says so instead of offering to apply.
 */
import { useToast } from "primevue/usetoast";
import type { RulePreviewFilter } from "@badger/shared-data";
import type { Category, IRule, RuleDraft } from "@badger/types";
import { ruleCategoryId } from "@badger/utils";
import { useApplyRuleMutation } from "~/composables/rules/useRules";
import { useRulePreviewList } from "~/composables/rules/useRulePreviewList";
import { getApiErrorMessage } from "~/utils/apiError";
import { selectAll, selectedCount, type RuleSelection } from "~/utils/ruleReviewSelection";
import RuleReview from "./RuleReview.vue";

const props = defineProps<{
    visible: boolean;
    rule: IRule | null;
}>();

const emit = defineEmits<{
    "update:visible": [value: boolean];
}>();

const toast = useToast();
const { data: categories } = useGetCategoriesQuery();
const applyRule = useApplyRuleMutation();

const apiError = ref<string | null>(null);
const selection = ref<RuleSelection>(selectAll());
const filter = ref<RulePreviewFilter>("all");
const search = ref("");

// The rule's own conditions and actions, in the shape the preview and the review take.
const draft = computed<RuleDraft | null>(() => {
    const rule = props.rule;
    if (!rule) return null;
    return {
        conditions: rule.conditions.map(({ field, operator, value }) => ({ field, operator, value })),
        actions: rule.actions.map(({ type, value }) => ({ type, value })),
    };
});

const category = computed(() => {
    const id = props.rule ? ruleCategoryId(props.rule) : null;
    return ((categories.value ?? []) as Category[]).find((item) => item.id === id);
});
const categoryName = computed(() => category.value?.name ?? "this category");
const reviewCategory = computed(() => ({
    name: categoryName.value,
    color: category.value?.color ?? "",
    icon: category.value?.icon ?? null,
}));

const { wouldChangeCount, matchCount, counts, isLoading } = useRulePreviewList(draft, filter, search);

// Every open, and every other rule, starts from all rows ticked and no error on screen.
watch(
    () => [props.visible, props.rule?.id],
    () => {
        selection.value = selectAll();
        apiError.value = null;
    },
);

const selected = computed(() => selectedCount(selection.value, wouldChangeCount.value));
// The totals come from the first page, so nothing is said until it has landed.
const nothingToChange = computed(() => counts.value !== null && !isLoading.value && wouldChangeCount.value === 0);
const busy = computed(() => applyRule.isPending.value);
const header = computed(() => `Apply "${props.rule?.name ?? ""}"`);

const nothingText = computed(() => {
    const total = matchCount.value;
    if (total === 1) return `All 1 transaction this rule matches already has ${categoryName.value}.`;
    return `All ${total} transactions this rule matches already have ${categoryName.value}.`;
});

const handleApply = async () => {
    const rule = props.rule;
    if (!rule || selected.value === 0) return;

    apiError.value = null;
    const target = categoryName.value;
    try {
        const { count } = await applyRule.mutateAsync({ id: rule.id, selection: selection.value });
        emit("update:visible", false);
        toast.add({
            severity: "success",
            summary: `Moved ${count} ${count === 1 ? "transaction" : "transactions"} to ${target}.`,
            life: 3000,
        });
    } catch (error) {
        apiError.value = getApiErrorMessage(error, "Could not apply the rule");
    }
};
</script>

<template>
    <SharedFormDialog
        :visible="visible"
        :header="header"
        initial-focus="dialog"
        :busy="busy"
        :api-error="apiError"
        :save-label="`Apply to ${selected}`"
        :save-disabled="selected === 0"
        :show-save="!nothingToChange"
        :cancel-label="nothingToChange ? 'Close' : 'Cancel'"
        width="45rem"
        @update:visible="emit('update:visible', $event)"
        @save="handleApply"
    >
        <SharedEmptyState
            v-if="nothingToChange"
            icon="pi-check"
            title="Nothing to change"
            :text="nothingText"
        />
        <RuleReview
            v-else-if="draft"
            v-model:selection="selection"
            :draft="draft"
            :category="reviewCategory"
        />
    </SharedFormDialog>
</template>
