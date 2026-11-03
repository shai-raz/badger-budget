<script setup lang="ts">
/**
 * One "field operator value" condition in the rule editor. The value control follows the field: text for
 * description and original category, an amount input, an account picker or a transaction type picker.
 * Rows are controlled: every change is emitted as a whole condition, and the editor owns the list.
 */
import type { IAccountResponse } from "@badger/types";
import {
    RULE_CONDITION_FIELDS,
    RULE_FIELD_LABELS,
    RULE_FIELD_OPERATORS,
    RULE_OPERATOR_LABELS,
    TRANSACTION_TYPES,
    TRANSACTION_TYPE_LABELS,
    type RuleConditionField,
    type RuleOperator,
} from "@badger/shared-data";
import { changeConditionField, type EditorCondition } from "~/utils/ruleEditor";
import { accountFallbackIcon } from "~/utils/avatarIcons";

interface Props {
    condition: EditorCondition;
    accounts: IAccountResponse[];
    /** False for the only row: a rule keeps at least one condition. */
    removable: boolean;
    error?: string;
    /** Focus the value control when the dialog opens (create forms). */
    autofocus?: boolean;
    /** Shown under the value when there is no error. */
    hint?: string;
}

const props = withDefaults(defineProps<Props>(), {
    error: undefined,
    autofocus: false,
    hint: undefined,
});

const emit = defineEmits<{
    "update:condition": [condition: EditorCondition];
    remove: [];
    blur: [];
}>();

const fieldId = computed(() => `rule-condition-field-${props.condition.key}`);
const operatorId = computed(() => `rule-condition-operator-${props.condition.key}`);
const valueId = computed(() => `rule-condition-value-${props.condition.key}`);
const errorId = computed(() => `rule-condition-error-${props.condition.key}`);

const fieldOptions = RULE_CONDITION_FIELDS.map((field) => ({ label: RULE_FIELD_LABELS[field], value: field }));

const operatorOptions = computed(() =>
    RULE_FIELD_OPERATORS[props.condition.field].map((operator) => ({
        label: RULE_OPERATOR_LABELS[operator],
        value: operator,
    })),
);

const typeOptions = TRANSACTION_TYPES.map((type) => ({ label: TRANSACTION_TYPE_LABELS[type], value: type }));

const valueKind = computed<"text" | "amount" | "account" | "type">(() => {
    switch (props.condition.field) {
        case "amount":
            return "amount";
        case "account":
            return "account";
        case "type":
            return "type";
        default:
            return "text";
    }
});

const patch = (next: Partial<EditorCondition>) => emit("update:condition", { ...props.condition, ...next });

const onFieldChange = (field: RuleConditionField) => {
    emit("update:condition", changeConditionField(props.condition, field));
};

const onOperatorChange = (operator: RuleOperator) => patch({ operator });

const textValue = computed({
    get: () => props.condition.value,
    set: (value: string) => patch({ value }),
});

// The amount is stored as a string; the input works in numbers, and an empty input is an empty string.
const amountValue = computed<number | null>({
    get: () => (props.condition.value === "" ? null : Number(props.condition.value)),
    set: (value) => patch({ value: value === null ? "" : String(value) }),
});

const selectedAccount = computed(() => props.accounts.find((account) => account.id === props.condition.value));

const onValueSelect = (value: string) => patch({ value });
</script>

<template>
    <!-- Phone: a bordered card with Field and the remove button on top, then Operator and Value side by side.
         Every grid is items-start: an error under Value must not stretch the selects beside it. -->
    <div
        class="grid grid-cols-[8.5rem_minmax(0,1fr)_auto] items-start gap-2 max-sm:rounded-lg max-sm:border max-sm:border-surface-200 max-sm:p-3 sm:flex dark:max-sm:border-surface-700"
    >
        <div
            class="contents min-w-0 flex-1 gap-2 sm:grid sm:grid-cols-[minmax(0,10rem)_minmax(0,11rem)_minmax(0,1fr)] sm:items-start"
        >
            <Select
                :input-id="fieldId"
                :model-value="condition.field"
                :options="fieldOptions"
                option-label="label"
                option-value="value"
                aria-label="Field"
                class="w-full max-sm:col-span-2"
                @update:model-value="onFieldChange"
            />

            <Select
                :input-id="operatorId"
                :model-value="condition.operator"
                :options="operatorOptions"
                option-label="label"
                option-value="value"
                aria-label="Operator"
                class="w-full max-sm:col-start-1 max-sm:row-start-2"
                @update:model-value="onOperatorChange"
            />

            <div class="flex min-w-0 flex-col gap-1 max-sm:col-start-2 max-sm:row-start-2">
                <InputText
                    v-if="valueKind === 'text'"
                    :id="valueId"
                    v-model="textValue"
                    placeholder="Enter a value"
                    class="w-full"
                    :invalid="!!error"
                    :autofocus="autofocus"
                    :aria-describedby="error ? errorId : undefined"
                    @blur="emit('blur')"
                />

                <InputNumber
                    v-else-if="valueKind === 'amount'"
                    v-model="amountValue"
                    :input-id="valueId"
                    mode="decimal"
                    locale="en-US"
                    :min="0"
                    :min-fraction-digits="2"
                    :max-fraction-digits="2"
                    placeholder="0.00"
                    class="w-full"
                    :invalid="!!error"
                    :pt="{ pcInputText: { root: { autofocus } } }"
                    :aria-describedby="error ? errorId : undefined"
                    @blur="emit('blur')"
                />

                <Select
                    v-else-if="valueKind === 'account'"
                    :input-id="valueId"
                    :model-value="condition.value"
                    :options="accounts"
                    option-label="name"
                    option-value="id"
                    placeholder="Choose an account"
                    class="w-full"
                    :invalid="!!error"
                    :autofocus="autofocus"
                    :aria-describedby="error ? errorId : undefined"
                    @update:model-value="onValueSelect"
                    @blur="emit('blur')"
                >
                    <template #value="slotProps">
                        <div
                            v-if="selectedAccount"
                            class="flex items-center gap-2"
                        >
                            <SharedEntityAvatar
                                size="xs"
                                :icon="selectedAccount.icon"
                                :color="selectedAccount.color"
                                :fallback="accountFallbackIcon(selectedAccount.type)"
                            />
                            <span>{{ selectedAccount.name }}</span>
                        </div>
                        <span v-else>{{ slotProps.placeholder }}</span>
                    </template>
                    <template #option="slotProps">
                        <div class="flex items-center gap-2">
                            <SharedEntityAvatar
                                size="xs"
                                :icon="slotProps.option.icon"
                                :color="slotProps.option.color"
                                :fallback="accountFallbackIcon(slotProps.option.type)"
                            />
                            <span>{{ slotProps.option.name }}</span>
                        </div>
                    </template>
                </Select>

                <Select
                    v-else
                    :input-id="valueId"
                    :model-value="condition.value"
                    :options="typeOptions"
                    option-label="label"
                    option-value="value"
                    placeholder="Choose a type"
                    class="w-full"
                    :invalid="!!error"
                    :autofocus="autofocus"
                    :aria-describedby="error ? errorId : undefined"
                    @update:model-value="onValueSelect"
                    @blur="emit('blur')"
                />

                <small
                    v-if="error"
                    :id="errorId"
                    class="block text-sm text-red-500"
                    >{{ error }}</small
                >
                <small
                    v-else-if="hint"
                    class="block text-sm text-muted-color"
                    >{{ hint }}</small
                >
            </div>
        </div>

        <Button
            icon="pi pi-times"
            text
            rounded
            severity="secondary"
            size="small"
            aria-label="Remove condition"
            class="mt-1 shrink-0 max-sm:col-start-3 max-sm:row-start-1"
            :disabled="!removable"
            @click="emit('remove')"
        />
    </div>
</template>
