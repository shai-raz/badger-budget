<script setup lang="ts">
import type { CreateRuleDto, ITransactionResponse, RuleConditionInput } from "@badger/types";
import { ref } from "vue";
import { useToast } from "primevue/usetoast";
import { autoRuleName, ruleCategoryId, ruleMatches } from "@badger/utils";
import MappingRuleForm from "./MappingRuleForm.vue";
import { useCreateRuleMutation } from "~/composables/rules/useCreateRule.mutation";
import { formatCurrency } from "~/utils/currency";
import { toRuleTransaction } from "~/utils/ruleTransaction";

interface Props {
    visible: boolean;
    transaction: ITransactionResponse | null;
}

const props = defineProps<Props>();

const emit = defineEmits<{
    "update:visible": [value: boolean];
    applyingRules: [isApplying: boolean];
}>();

/** What MappingRuleForm emits: the category to set, the one condition, and whether a match stops later rules. */
interface MappingRuleData {
    categoryId: string;
    condition: RuleConditionInput;
    stopOnMatch: boolean;
}

const toast = useToast();
const { mutateAsync: updateTransaction } = useUpdateTransactionMutation();
const { mutateAsync: createRule } = useCreateRuleMutation();

const { data: categories } = useGetCategoriesQuery();
const saving = ref(false);

const handleClose = () => {
    emit("update:visible", false);
};

const buildRuleDto = (ruleData: MappingRuleData): CreateRuleDto => ({
    name: autoRuleName([ruleData.condition]),
    conditions: [ruleData.condition],
    actions: [{ type: "set_category", value: ruleData.categoryId }],
    stopOnMatch: ruleData.stopOnMatch,
});

const handleMappingRuleSave = async (ruleData: MappingRuleData) => {
    const transaction = props.transaction;
    if (!transaction) return;

    saving.value = true;
    try {
        const { rule } = await createRule(buildRuleDto(ruleData));

        // Update this transaction now only when the new rule matches it; the other rows wait for an apply.
        const matchedCategoryId = ruleCategoryId(rule);
        if (matchedCategoryId && ruleMatches(toRuleTransaction(transaction), rule)) {
            await updateTransaction({
                id: transaction.id,
                data: {
                    categoryId: matchedCategoryId,
                },
            });
        }

        toast.add({
            severity: "success",
            summary: "Success",
            detail: "Mapping rule created successfully",
            life: 3000,
        });

        handleClose();
    } catch (error) {
        toast.add({
            severity: "error",
            summary: "Error",
            detail: getErrorMessage(error, "Failed to create mapping rule"),
            life: 3000,
        });
    } finally {
        saving.value = false;
    }
};

const handleMappingRuleSaveAndApply = async (ruleData: MappingRuleData) => {
    if (!props.transaction) return;

    saving.value = true;
    // The apply runs inside the same save, so a failure leaves no rule behind and the dialog stays open to retry.
    emit("applyingRules", true);
    try {
        const { appliedCount } = await createRule({
            ...buildRuleDto(ruleData),
            apply: { mode: "allExcept", ids: [] },
        });

        handleClose();

        toast.add({
            severity: "success",
            summary: "Success",
            detail: `Mapping rule created and applied to ${appliedCount ?? 0} transaction(s)`,
            life: 5000,
        });
    } catch (error) {
        toast.add({
            severity: "error",
            summary: "Error",
            detail: getErrorMessage(error, "Failed to create and apply mapping rule"),
            life: 3000,
        });
    } finally {
        saving.value = false;
        emit("applyingRules", false);
    }
};
</script>

<template>
    <Dialog
        :visible="visible"
        modal
        header="Apply category rule"
        :style="{ width: '40rem' }"
        @update:visible="emit('update:visible', $event)"
    >
        <div v-if="transaction">
            <div class="mb-4">
                <div class="text-sm text-muted-color mb-1">Transaction</div>
                <div class="font-semibold">{{ transaction.description }}</div>
                <div class="text-sm text-muted-color">
                    {{ formatCurrency(transaction.amount, transaction.currency.code) }}
                </div>
            </div>

            <MappingRuleForm
                :transaction="transaction"
                :categories="categories ?? []"
                @save="handleMappingRuleSave"
                @save-and-apply="handleMappingRuleSaveAndApply"
            />
        </div>

        <template #footer>
            <Button
                label="Cancel"
                icon="pi pi-times"
                text
                :disabled="saving"
                @click="handleClose"
            />
        </template>
    </Dialog>
</template>
