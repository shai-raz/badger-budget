<script setup lang="ts">
import type { Category, CreateCategoryMappingRuleDto, ITransactionResponse } from "@badger/types";
import { ref, watch, computed } from "vue";

interface Props {
    transaction: ITransactionResponse | null;
    categories: Category[];
}

const props = defineProps<Props>();

const emit = defineEmits<{
    save: [ruleData: RuleData];
    saveAndApply: [ruleData: RuleData];
}>();

const { hideSystemCategories } = useSystemCategoryVisibility();

interface RuleData {
    categoryId: string;
    field: "description" | "originalCategory" | "amount";
    operator: CreateCategoryMappingRuleDto["operator"];
    value: string;
    stopOnMatch: boolean;
}

// State
const selectedField = ref<"description" | "originalCategory" | "amount">("description");
const selectedOperator = ref<CreateCategoryMappingRuleDto["operator"]>("contains");
const ruleValue = ref<string>("");
const ruleValueNumber = ref<number | null>(null);
const stopOnMatch = ref<boolean>(true);
const selectedCategoryId = ref<string | null>(null);

// Field options
const fieldOptions = [
    { label: "Description", value: "description" },
    { label: "Original Category", value: "originalCategory" },
    { label: "Amount", value: "amount" },
];

// Filter categories based on system category visibility toggle
const filteredCategories = computed(() => {
    if (!hideSystemCategories.value) {
        return props.categories;
    }
    return props.categories.filter((c) => !c.isSystem);
});

// Category options for dropdown
const categoryOptions = computed(() => {
    return filteredCategories.value.map((cat) => ({
        label: cat.name,
        value: cat.id,
    }));
});

// Dynamic operator options based on selected field
const operatorOptions = computed(() => {
    if (selectedField.value === "amount") {
        return [
            { label: "Equals", value: "equals" },
            { label: "Greater Than", value: "greaterThan" },
            { label: "Less Than", value: "lessThan" },
        ];
    } else {
        return [
            { label: "Contains", value: "contains" },
            { label: "Equals", value: "equals" },
            { label: "Starts With", value: "startsWith" },
            { label: "Ends With", value: "endsWith" },
        ];
    }
});

// Watch field changes to update operator
watch(selectedField, (newField) => {
    // Reset operator when field changes
    if (newField === "amount") {
        selectedOperator.value = "equals";
        ruleValueNumber.value = null;
    } else {
        selectedOperator.value = "contains";
        ruleValue.value = "";
    }
});

// Initialize with transaction data
watch(
    () => props.transaction,
    (transaction) => {
        if (transaction) {
            selectedField.value = "description";
            selectedOperator.value = "contains";
            ruleValue.value = transaction.description;
            stopOnMatch.value = true;
            selectedCategoryId.value = transaction.categoryId || null;
        }
    },
    { immediate: true },
);

const canSave = computed(() => {
    if (selectedField.value === "amount") {
        return selectedCategoryId.value !== null && ruleValueNumber.value !== null;
    }
    return selectedCategoryId.value !== null && ruleValue.value.trim().length > 0;
});

const handleSave = () => {
    if (!canSave.value || !selectedCategoryId.value) return;

    const ruleData: RuleData = {
        categoryId: selectedCategoryId.value,
        field: selectedField.value,
        operator: selectedOperator.value,
        value: selectedField.value === "amount" ? String(ruleValueNumber.value) : ruleValue.value,
        stopOnMatch: stopOnMatch.value,
    };

    emit("save", ruleData);
};

const handleSaveAndApply = () => {
    if (!canSave.value || !selectedCategoryId.value) return;

    const ruleData: RuleData = {
        categoryId: selectedCategoryId.value,
        field: selectedField.value,
        operator: selectedOperator.value,
        value: selectedField.value === "amount" ? String(ruleValueNumber.value) : ruleValue.value,
        stopOnMatch: stopOnMatch.value,
    };

    emit("saveAndApply", ruleData);
};
</script>

<template>
    <div class="flex flex-col gap-4">
        <div>
            <label
                for="category"
                class="block text-sm font-medium mb-2"
                >Apply Category</label
            >
            <Dropdown
                id="category"
                v-model="selectedCategoryId"
                :options="categoryOptions"
                option-label="label"
                option-value="value"
                placeholder="Select category to apply"
                class="w-full"
            />
        </div>

        <div>
            <label
                for="field"
                class="block text-sm font-medium mb-2"
                >Field to Match</label
            >
            <Dropdown
                id="field"
                v-model="selectedField"
                :options="fieldOptions"
                option-label="label"
                option-value="value"
                placeholder="Select field"
                class="w-full"
            />
        </div>

        <div>
            <label
                for="operator"
                class="block text-sm font-medium mb-2"
                >Operator</label
            >
            <Dropdown
                id="operator"
                v-model="selectedOperator"
                :options="operatorOptions"
                option-label="label"
                option-value="value"
                placeholder="Select operator"
                class="w-full"
            />
        </div>

        <div>
            <label
                for="value"
                class="block text-sm font-medium mb-2"
                >Value</label
            >
            <InputNumber
                v-if="selectedField === 'amount'"
                id="value"
                v-model="ruleValueNumber"
                mode="decimal"
                :min-fraction-digits="2"
                :max-fraction-digits="2"
                placeholder="Enter amount"
                class="w-full"
            />
            <InputText
                v-else
                id="value"
                v-model="ruleValue"
                placeholder="Enter value"
                class="w-full"
            />
        </div>

        <div class="flex items-center gap-2">
            <Checkbox
                v-model="stopOnMatch"
                input-id="stopOnMatch"
                :binary="true"
            />
            <label
                for="stopOnMatch"
                class="cursor-pointer"
            >
                Stop processing other rules if this matches
            </label>
        </div>

        <div class="flex gap-2 mt-4">
            <Button
                label="Save"
                icon="pi pi-check"
                :disabled="!canSave"
                class="flex-1"
                @click="handleSave"
            />
            <Button
                label="Save and Apply to All"
                icon="pi pi-bolt"
                :disabled="!canSave"
                class="flex-1"
                severity="success"
                @click="handleSaveAndApply"
            />
        </div>
    </div>
</template>
