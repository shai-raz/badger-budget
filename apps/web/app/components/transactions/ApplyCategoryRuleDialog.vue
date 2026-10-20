<script setup lang="ts">
import type { CreateCategoryMappingRuleDto, ITransactionResponse } from "@badger/types";
import { ref } from "vue";
import { useToast } from "primevue/usetoast";
import { findMatchingCategoryId } from "@badger/utils";
import MappingRuleForm from "./MappingRuleForm.vue";
import { useCreateCategoryMappingRuleMutation } from "~/composables/category-mapping-rules/useCreateCategoryMappingRule.mutation";
import { useApplyCategoryMappingRuleMutation } from "~/composables/category-mapping-rules/useApplyCategoryMappingRule.mutation";
import { formatCurrency } from "~/utils/currency";

interface Props {
    visible: boolean;
    transaction: ITransactionResponse | null;
}

const props = defineProps<Props>();

const emit = defineEmits<{
    "update:visible": [value: boolean];
    applyingRules: [isApplying: boolean];
}>();

const toast = useToast();
const { mutateAsync: updateTransaction } = useUpdateTransactionMutation();
const { mutateAsync: createMappingRule } = useCreateCategoryMappingRuleMutation();
const { mutateAsync: applyMappingRule } = useApplyCategoryMappingRuleMutation();

const { data: categories } = useGetCategoriesQuery();
const saving = ref(false);

const handleClose = () => {
    emit("update:visible", false);
};

const handleMappingRuleSave = async (ruleData: CreateCategoryMappingRuleDto) => {
    if (!props.transaction) return;

    saving.value = true;
    try {
        // Create the mapping rule
        const createdRule = await createMappingRule(ruleData);

        // Optimistically apply the rule to current transaction
        const transactionData = {
            description: props.transaction.description,
            originalCategory: props.transaction.originalCategory || undefined,
            amount: props.transaction.amount,
        };

        const matchedCategoryId = findMatchingCategoryId(transactionData, [createdRule]);

        if (matchedCategoryId) {
            await updateTransaction({
                id: props.transaction.id,
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

const handleMappingRuleSaveAndApply = async (ruleData: CreateCategoryMappingRuleDto) => {
    if (!props.transaction) return;

    saving.value = true;
    try {
        // Create the mapping rule
        const createdRule = await createMappingRule(ruleData);

        // Close dialog immediately
        handleClose();

        // Emit event to show loading message
        emit("applyingRules", true);

        // Apply rule to all transactions
        const result = await applyMappingRule(createdRule.id);

        toast.add({
            severity: "success",
            summary: "Success",
            detail: `Mapping rule created and applied to ${result.count} transaction(s)`,
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
