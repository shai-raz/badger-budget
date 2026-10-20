<script setup lang="ts">
import type { Category, ICurrencyResponse } from "@badger/types";
import { currencyDisplayLabel } from "../../utils/transactionForm";
import { getLocaleCurrencyCode } from "../../utils/locale-currency";
import {
    BUDGET_PERIOD_OPTIONS,
    buildBudgetPayload,
    createInitialBudgetValues,
    validateBudgetForm,
    type BudgetFormErrors,
    type BudgetFormPayload,
    type BudgetFormValues,
} from "../../utils/budgetForm";

const props = withDefaults(
    defineProps<{
        currencies: ICurrencyResponse[];
        /** Edit mode: the saved budget's values. Create mode leaves it unset. */
        initial?: BudgetFormValues;
        disabled?: boolean;
        autofocusAmount?: boolean;
    }>(),
    { initial: undefined, disabled: false, autofocusAmount: false },
);

// The dialog remounts this form on every open (via :key), so values are initialised once.
const values = reactive<BudgetFormValues>(
    props.initial
        ? { ...props.initial, categoryIds: [...props.initial.categoryIds] }
        : createInitialBudgetValues(props.currencies, { localeCurrencyCode: getLocaleCurrencyCode() }),
);

const errors = computed<BudgetFormErrors>(() => validateBudgetForm(values));
const submitted = ref(false);
const touched = reactive(new Set<string>());
const markTouched = (field: string) => touched.add(field);
const showError = (field: keyof BudgetFormValues) =>
    (submitted.value || touched.has(field)) && errors.value[field] ? errors.value[field] : null;

const { options: selectableCategories } = useSelectableCategories();
const { data: allCategories } = useGetCategoriesQuery();

// Keep selected categories visible even when system categories are hidden, so a saved selection never drops out.
const categoryOptions = computed<Category[]>(() => {
    const options = [...selectableCategories.value];
    const listed = new Set(options.map((c) => c.id));
    for (const id of values.categoryIds) {
        if (listed.has(id)) continue;
        const category = ((allCategories.value ?? []) as Category[]).find((c) => c.id === id);
        if (category) options.push(category);
    }
    return options;
});

const selectedCurrency = computed(() => props.currencies.find((c) => c.id === values.currencyId));
const currencyTriggerLabel = computed(() =>
    selectedCurrency.value ? currencyDisplayLabel(selectedCurrency.value, props.currencies) : "",
);

/** Validates, then returns the request body (or null). Shell-owned Save calls this via the template ref. */
const submit = (): BudgetFormPayload | null => {
    submitted.value = true;
    return buildBudgetPayload(values);
};

defineExpose({ submit });

const errorClass = "text-sm text-red-500";
const labelClass = "text-sm font-medium text-surface-700 dark:text-surface-200";
</script>

<template>
    <div class="flex flex-col gap-4">
        <!-- Amount hero: the figure and currency sit on one line, as in the transaction form -->
        <div class="flex flex-col gap-1">
            <div class="flex w-full items-center justify-center gap-2">
                <InputNumber
                    v-model="values.amount"
                    input-id="budget-amount"
                    mode="decimal"
                    locale="en-US"
                    :min-fraction-digits="2"
                    :max-fraction-digits="2"
                    :min="0"
                    placeholder="0.00"
                    aria-label="Amount"
                    :pt="{ pcInputText: { root: { autofocus: autofocusAmount } } }"
                    :disabled="disabled"
                    :invalid="!!showError('amount')"
                    :input-class="['!text-4xl', '!font-bold', 'text-center', 'w-full', 'min-w-0']"
                    class="min-w-0 flex-1"
                    @blur="markTouched('amount')"
                />
                <Select
                    v-if="currencies.length"
                    v-model="values.currencyId"
                    :options="currencies"
                    option-value="id"
                    option-label="name"
                    filter
                    :filter-fields="['name', 'code', 'symbol']"
                    aria-label="Currency"
                    :disabled="disabled"
                    :invalid="!!showError('currencyId')"
                    :pt="{
                        root: { class: '!w-auto shrink-0 !border-0 !bg-transparent !shadow-none' },
                        label: { class: '!px-1 !py-0 !text-lg !font-semibold' },
                        overlay: { class: 'min-w-64' },
                    }"
                    @update:model-value="markTouched('currencyId')"
                >
                    <template #value>
                        <span>{{ currencyTriggerLabel }}</span>
                    </template>
                    <template #option="slotProps">
                        <div class="flex w-full items-center justify-between gap-3">
                            <span>{{ slotProps.option.name }}</span>
                            <span class="text-surface-500 dark:text-surface-400">
                                {{ slotProps.option.symbol }} {{ slotProps.option.code }}
                            </span>
                        </div>
                    </template>
                </Select>
            </div>
            <small
                v-if="showError('amount')"
                :class="errorClass"
                role="alert"
            >
                {{ showError("amount") }}
            </small>
            <small
                v-if="showError('currencyId')"
                :class="errorClass"
                role="alert"
            >
                {{ showError("currencyId") }}
            </small>
        </div>

        <div class="flex flex-col gap-1">
            <label
                for="budget-name"
                :class="labelClass"
                >Name</label
            >
            <InputText
                id="budget-name"
                v-model="values.name"
                placeholder="e.g. Groceries"
                fluid
                :disabled="disabled"
                :invalid="!!showError('name')"
                @blur="markTouched('name')"
            />
            <small
                v-if="showError('name')"
                :class="errorClass"
                role="alert"
            >
                {{ showError("name") }}
            </small>
        </div>

        <div class="flex flex-col gap-1">
            <span :class="labelClass">Period</span>
            <SelectButton
                v-model="values.period"
                :options="BUDGET_PERIOD_OPTIONS"
                option-label="label"
                option-value="value"
                :allow-empty="false"
                :disabled="disabled"
                aria-label="Period"
                class="flex w-full"
                :pt="{ pcToggleButton: { root: { class: 'flex-1' } } }"
            />
        </div>

        <div class="flex flex-col gap-1">
            <label
                for="budget-start"
                :class="labelClass"
                >Start date</label
            >
            <DatePicker
                v-model="values.startDate"
                input-id="budget-start"
                show-icon
                icon-display="input"
                :manual-input="false"
                date-format="M d, yy"
                fluid
                :disabled="disabled"
                :invalid="!!showError('startDate')"
                @update:model-value="markTouched('startDate')"
            />
            <small
                v-if="showError('startDate')"
                :class="errorClass"
                role="alert"
            >
                {{ showError("startDate") }}
            </small>
        </div>

        <div class="flex flex-col gap-1">
            <label
                for="budget-categories"
                :class="labelClass"
                >Categories</label
            >
            <MultiSelect
                v-model="values.categoryIds"
                input-id="budget-categories"
                :options="categoryOptions"
                option-label="name"
                option-value="id"
                display="chip"
                filter
                fluid
                placeholder="Choose categories"
                :disabled="disabled"
                :invalid="!!showError('categoryIds')"
                @update:model-value="markTouched('categoryIds')"
            />
            <small
                v-if="showError('categoryIds')"
                :class="errorClass"
                role="alert"
            >
                {{ showError("categoryIds") }}
            </small>
        </div>
    </div>
</template>
