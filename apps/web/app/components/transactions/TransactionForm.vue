<script setup lang="ts">
import type { Category, IAccountResponse, ICurrencyResponse, ITransactionResponse } from "@badger/types";
import { TRANSACTION_ADDITIONAL_DESCRIPTION_MAX_LENGTH, TRANSACTION_NOTES_MAX_LENGTH } from "@badger/shared-data";
import { transactionAmountClass, transactionSign } from "./formatters";
import { getLocaleCurrencyCode } from "../../utils/locale-currency";
import { accountTypeCaption } from "../../utils/accountBalance";
import LockHint from "./LockHint.vue";
import { matchesCashWithdrawal, pickCashWallet } from "../../utils/cashWithdrawal";
import { nextPendingCategory, type PendingCategory } from "../../utils/pendingCategory";
import {
    LOCKED_DIRECTION_TOOLTIP,
    LOCKED_FIELD_TOOLTIP,
    MIRROR_TOOLTIP,
    NOTES_COUNTER_FROM,
    buildCreateTransactionPayload,
    bankDirection,
    buildUpdateTransactionPayload,
    counterpartLabel,
    currencyForAccountChange,
    shouldKeepInitialCounterpartAmount,
    counterpartOptions,
    createInitialFormValues,
    type TransactionFormPrefill,
    currencyDisplayLabel,
    defaultCounterpartAmount,
    directionForTypeChange,
    editConstraintsFor,
    isCurrencyLockedByAccount,
    isEditDirty,
    isTypeAllowed,
    neededCounterpartCurrencyId,
    resolveDefaultCurrencyId,
    transactionToFormValues,
    validateTransactionEdit,
    validateTransactionForm,
    type CreateTransactionPayload,
    type EditConstraints,
    type LockableField,
    type TransactionFormValues,
    type TransactionType,
    type UpdateTransactionPayload,
} from "../../utils/transactionForm";

const props = defineProps<{
    accounts: IAccountResponse[];
    currencies: ICurrencyResponse[];
    disabled?: boolean;
    /** Edit mode: the label-row "Save & create rule" action is saving first. */
    createRuleLoading?: boolean;
    /** When set, the form edits this transaction instead of creating one. */
    transaction?: ITransactionResponse | null;
    /** Create mode: initial account, type and category. */
    prefill?: TransactionFormPrefill;
}>();

const emit = defineEmits<{ dirtyChange: [dirty: boolean]; createRule: [] }>();

const isEdit = computed(() => !!props.transaction);

// Initialised once: the dialog remounts the form on each open.
const initialValues: Readonly<TransactionFormValues> = Object.freeze(
    props.transaction ? transactionToFormValues(props.transaction) : ({} as TransactionFormValues),
);
const constraints: EditConstraints = props.transaction
    ? editConstraintsFor(props.transaction)
    : { synced: false, mirror: false, source: null, locked: new Set<LockableField>(), bankDirection: null };
const values = reactive<TransactionFormValues>(
    props.transaction
        ? transactionToFormValues(props.transaction)
        : createInitialFormValues(props.accounts, props.currencies, {
              localeCurrencyCode: getLocaleCurrencyCode(),
              prefill: props.prefill,
          }),
);
const isLocked = (f: LockableField) => isEdit.value && constraints.locked.has(f);
const lockTooltip = constraints.mirror ? MIRROR_TOOLTIP(constraints.source) : LOCKED_FIELD_TOOLTIP;
const directionTooltip = constraints.mirror ? MIRROR_TOOLTIP(constraints.source) : LOCKED_DIRECTION_TOOLTIP;

const typeOptions = [
    { label: "Expense", value: "expense" },
    { label: "Income", value: "income" },
    { label: "Transfer", value: "transfer" },
];
const directionOptions = [
    { label: "Out", value: "out" },
    { label: "In", value: "in" },
];

const submitted = ref(false);
const touched = reactive(new Set<string>());
const markTouched = (field: string) => touched.add(field);

const errors = computed(() =>
    isEdit.value ? validateTransactionEdit(initialValues, values, constraints) : validateTransactionForm(values),
);
const { data: categories } = useGetCategoriesQuery();
const pendingCategory = ref<PendingCategory | null>(null);
const pendingName = computed<string | null>({
    get: () => pendingCategory.value?.name ?? null,
    set: (n) => {
        pendingCategory.value = n
            ? nextPendingCategory(
                  pendingCategory.value,
                  n,
                  ((categories.value ?? []) as Category[]).map((c) => c.color),
              )
            : null;
    },
});
const dirty = computed(
    () => isEdit.value && (isEditDirty(initialValues, values, constraints) || !!pendingCategory.value),
);
watch(dirty, (d) => emit("dirtyChange", d), { immediate: true });
const showError = (field: keyof TransactionFormValues) =>
    (submitted.value || touched.has(field)) && errors.value[field] ? errors.value[field] : null;

const directionRef = computed(() => ({
    type: values.type,
    transferDirection: values.type === "transfer" ? values.transferDirection : null,
}));
const signGlyph = computed(() => transactionSign(directionRef.value));
const amountClass = computed(() => transactionAmountClass(directionRef.value));
const selectedCurrency = computed(() => props.currencies.find((c) => c.id === values.currencyId));
const currencyTriggerLabel = computed(() =>
    selectedCurrency.value ? currencyDisplayLabel(selectedCurrency.value, props.currencies) : "",
);

const selectedAccount = computed(() => props.accounts.find((a) => a.id === values.accountId));

// Currency follows the account until the user picks one explicitly.
const currencyTouched = ref(false);
watch(
    () => values.accountId,
    () => {
        if (isCurrencyLockedByAccount(selectedAccount.value) && selectedAccount.value?.currencyId) {
            const forced = currencyForAccountChange(selectedAccount.value, {
                isEdit: isEdit.value,
                currencyLocked: isLocked("currencyId"),
            });
            if (forced) values.currencyId = forced;
            return;
        }
        if (isEdit.value || currencyTouched.value) return;
        values.currencyId = resolveDefaultCurrencyId(
            selectedAccount.value,
            props.currencies,
            getLocaleCurrencyCode(),
            props.accounts,
        );
    },
);

const currencyLockedByAccount = computed(() => isCurrencyLockedByAccount(selectedAccount.value));

// Counterpart ledger account (cash or savings; transfers only).
const createdWallet = ref<IAccountResponse | null>(null);
const walletOptions = computed(() => {
    const all = [...props.accounts];
    if (createdWallet.value && !all.some((a) => a.id === createdWallet.value?.id)) all.push(createdWallet.value);
    return counterpartOptions(all, values.accountId);
});
const wallet = computed(() => walletOptions.value.find((a) => a.id === values.counterpartAccountId));
// A wallet that drops out of the options (e.g. it became the source account) must not stay selected.
watch(walletOptions, (opts) => {
    if (values.counterpartAccountId && !opts.some((a) => a.id === values.counterpartAccountId)) {
        values.counterpartAccountId = null;
    }
});
const walletCurrency = computed(() => props.currencies.find((c) => c.id === wallet.value?.currencyId));
const neededCurrencyId = computed(() => neededCounterpartCurrencyId(values, props.transaction));
const neededCurrency = computed(() => props.currencies.find((c) => c.id === neededCurrencyId.value));
const canCreateWallet = computed(
    () =>
        values.type === "transfer" &&
        !!neededCurrency.value &&
        !walletOptions.value.some((a) => a.type === "cash" && a.currencyId === neededCurrencyId.value),
);
const createAccount = useCreateAccount();
const walletError = ref<string | null>(null);
const createWallet = async () => {
    const currency = neededCurrency.value;
    if (!currency) return;
    walletError.value = null;
    try {
        const created = await createAccount.mutateAsync({
            name: `Cash (${currency.code})`,
            type: "cash",
            currencyId: currency.id,
            icon: "wallet",
            color: "#64748B",
        });
        createdWallet.value = created;
        values.counterpartAccountId = created.id;
    } catch (e) {
        walletError.value = e instanceof Error ? e.message : "Couldn't create the wallet";
    }
};

const counterpartAmountTouched = ref(false);
watch(
    () => [values.counterpartAccountId, values.amount, values.currencyId] as const,
    ([accountId], old) => {
        if (old && old[0] !== accountId) counterpartAmountTouched.value = false;
        if (counterpartAmountTouched.value) return;
        if (!accountId || !wallet.value) {
            if (!accountId) values.counterpartAmount = null;
            return;
        }
        if (isEdit.value && shouldKeepInitialCounterpartAmount(initialValues, values, accountId)) {
            values.counterpartAmount = initialValues.counterpartAmount;
            return;
        }
        values.counterpartAmount = defaultCounterpartAmount(
            {
                amount: values.amount,
                currencyId: values.currencyId,
                originalAmount: props.transaction?.originalAmount,
                originalCurrencyId: props.transaction?.originalCurrencyId,
            },
            wallet.value.currencyId ?? null,
        );
    },
);

const onCurrencyChange = () => {
    currencyTouched.value = true;
    markTouched("currencyId");
};

watch(
    () => values.type,
    (type, oldType) => {
        if (isEdit.value) {
            values.transferDirection = directionForTypeChange(
                type,
                { type: oldType, transferDirection: values.transferDirection },
                constraints,
            );
        }
    },
);

const notesLength = computed(() => values.notes.length);

const hasErrors = (): boolean => {
    submitted.value = true;
    return Object.keys(errors.value).length > 0;
};

const submit = (): CreateTransactionPayload | null => (hasErrors() ? null : buildCreateTransactionPayload(values));
const submitUpdate = (): UpdateTransactionPayload | null =>
    hasErrors() ? null : buildUpdateTransactionPayload(initialValues, values, constraints);

defineExpose({
    submit,
    submitUpdate,
    pendingCategory: (): PendingCategory | null =>
        pendingCategory.value ? { ...pendingCategory.value, name: pendingCategory.value.name.trim() } : null,
    adoptCategory: (id: string) => {
        values.categoryId = id;
        pendingCategory.value = null;
    },
});

const { data: cashWithdrawalPatterns } = useGetCashWithdrawalPatterns();
const showWithdrawalHint = computed(
    () =>
        isEdit.value &&
        !!props.transaction &&
        !constraints.mirror &&
        initialValues.type !== "transfer" &&
        values.type !== "transfer" &&
        bankDirection(props.transaction) === "out" &&
        matchesCashWithdrawal(props.transaction, cashWithdrawalPatterns.value ?? []),
);
// Prefills the conversion only; nothing is saved until the user presses Save.
const applyWithdrawalHint = () => {
    if (!props.transaction) return;
    values.type = "transfer";
    values.transferDirection = "out";
    const currency = props.transaction.originalCurrencyId ?? props.transaction.currencyId;
    values.counterpartAccountId =
        pickCashWallet(counterpartOptions(props.accounts, values.accountId), currency)?.id ?? null;
};

const errorClass = "text-sm text-red-500";
const labelClass = "text-sm font-medium text-surface-700 dark:text-surface-200";
const helperClass = "text-sm text-surface-500 dark:text-surface-400";
</script>

<template>
    <form
        class="flex flex-col gap-4"
        novalidate
        @submit.prevent
    >
        <!-- Both banners skip Message's enter animation (its Transition defaults to `appear`). -->
        <Message
            v-if="showWithdrawalHint"
            severity="info"
            :closable="false"
            :pt="{ transition: { appear: false } }"
        >
            <div class="flex flex-wrap items-center gap-2">
                <span>Looks like a cash withdrawal</span>
                <Button
                    label="Move to a cash wallet"
                    text
                    size="small"
                    type="button"
                    @click="applyWithdrawalHint"
                />
            </div>
        </Message>
        <Message
            v-if="constraints.mirror"
            severity="secondary"
            :closable="false"
            :pt="{ transition: { appear: false } }"
        >
            This entry follows a linked transfer.
            <NuxtLink
                v-if="constraints.source"
                :to="`/transactions/${constraints.source.id}`"
                class="font-medium underline"
            >
                View the source transaction
            </NuxtLink>
        </Message>

        <!-- Amount hero -->
        <div class="flex flex-col gap-3">
            <div
                v-if="isLocked('type')"
                class="flex items-center gap-2"
            >
                <span :class="labelClass">Type</span>
                <LockHint :tooltip="lockTooltip" />
            </div>
            <SelectButton
                v-model="values.type"
                :options="typeOptions"
                option-label="label"
                option-value="value"
                :allow-empty="false"
                :option-disabled="(o: { value: TransactionType }) => isEdit && !isTypeAllowed(o.value, constraints)"
                :disabled="disabled || isLocked('type')"
                aria-label="Transaction type"
                class="flex w-full"
                :pt="{ pcToggleButton: { root: { class: 'flex-1' } } }"
            />
            <div class="flex flex-col items-center gap-1">
                <LockHint
                    v-if="isLocked('amount')"
                    :tooltip="lockTooltip"
                />
                <LockHint
                    v-else-if="currencyLockedByAccount"
                    tooltip="This account uses its own currency"
                />
                <div class="flex w-full items-center justify-center gap-2">
                    <span
                        class="text-4xl font-bold"
                        :class="amountClass"
                        aria-hidden="true"
                    >
                        {{ signGlyph }}
                    </span>
                    <InputNumber
                        v-model="values.amount"
                        input-id="tx-amount"
                        mode="decimal"
                        locale="en-US"
                        :min-fraction-digits="2"
                        :max-fraction-digits="2"
                        :min="0"
                        placeholder="0.00"
                        aria-label="Amount"
                        :pt="{ pcInputText: { root: { autofocus: !isEdit } } }"
                        :disabled="disabled || isLocked('amount')"
                        :invalid="!!showError('amount')"
                        :input-class="['!text-4xl', '!font-bold', 'text-center', 'w-full', 'min-w-0', amountClass]"
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
                        :disabled="disabled || isLocked('currencyId') || currencyLockedByAccount"
                        :invalid="!!showError('currencyId')"
                        :pt="{
                            root: { class: '!w-auto shrink-0 !border-0 !bg-transparent !shadow-none' },
                            label: { class: '!px-1 !py-0 !text-lg !font-semibold' },
                            overlay: { class: 'min-w-64' },
                        }"
                        @update:model-value="onCurrencyChange"
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
        </div>

        <!-- Description -->
        <div class="flex flex-col gap-1">
            <div class="flex items-center gap-2">
                <label
                    for="tx-description"
                    :class="labelClass"
                >
                    Description
                </label>
                <LockHint
                    v-if="isLocked('description')"
                    :tooltip="lockTooltip"
                />
            </div>
            <InputText
                id="tx-description"
                v-model="values.description"
                fluid
                :disabled="disabled || isLocked('description')"
                :invalid="!!showError('description')"
                @blur="markTouched('description')"
            />
            <small
                v-if="showError('description')"
                :class="errorClass"
            >
                {{ showError("description") }}
            </small>
        </div>

        <!-- Account -->
        <div class="flex flex-col gap-1">
            <div class="flex items-center gap-2">
                <label
                    for="tx-account"
                    :class="labelClass"
                >
                    Account
                </label>
                <LockHint
                    v-if="isLocked('accountId')"
                    :tooltip="lockTooltip"
                />
            </div>
            <Select
                v-model="values.accountId"
                input-id="tx-account"
                :options="accounts"
                option-label="name"
                option-value="id"
                placeholder="Select an account"
                fluid
                :disabled="disabled || isLocked('accountId')"
                :invalid="!!showError('accountId')"
                @update:model-value="markTouched('accountId')"
            >
                <template #value="slotProps">
                    <span v-if="slotProps.value && !selectedAccount && transaction">
                        {{ transaction.account.name }}
                    </span>
                    <div
                        v-else-if="slotProps.value && selectedAccount"
                        class="flex items-center gap-2"
                    >
                        <div
                            v-if="selectedAccount.color"
                            class="h-4 w-4 rounded-full"
                            :style="{ backgroundColor: selectedAccount.color }"
                        ></div>
                        <span>{{ selectedAccount.name }}</span>
                    </div>
                    <span v-else>{{ slotProps.placeholder }}</span>
                </template>
                <template #option="slotProps">
                    <div class="flex items-center gap-2">
                        <div
                            v-if="slotProps.option.color"
                            class="h-4 w-4 rounded-full"
                            :style="{ backgroundColor: slotProps.option.color }"
                        ></div>
                        <span>{{ slotProps.option.name }}</span>
                    </div>
                </template>
            </Select>
            <small
                v-if="showError('accountId')"
                :class="errorClass"
            >
                {{ showError("accountId") }}
            </small>
        </div>

        <!-- Date -->
        <div class="flex flex-col gap-1">
            <div class="flex items-center gap-2">
                <label
                    for="tx-date"
                    :class="labelClass"
                >
                    Date
                </label>
                <LockHint
                    v-if="isLocked('date')"
                    :tooltip="lockTooltip"
                />
            </div>
            <DatePicker
                v-model="values.date"
                input-id="tx-date"
                show-icon
                icon-display="input"
                :manual-input="false"
                date-format="M d, yy"
                fluid
                :disabled="disabled || isLocked('date')"
                :invalid="!!showError('date')"
                @update:model-value="markTouched('date')"
            />
            <small
                v-if="showError('date')"
                :class="errorClass"
            >
                {{ showError("date") }}
            </small>
        </div>

        <!-- Category -->
        <div class="flex flex-col gap-1">
            <div class="flex items-center justify-between gap-2">
                <label
                    for="tx-category"
                    :class="labelClass"
                >
                    Category
                    <span class="font-normal text-surface-500 dark:text-surface-400">(optional)</span>
                </label>
                <LockHint
                    v-if="isLocked('categoryId')"
                    :tooltip="lockTooltip"
                />
                <Button
                    v-if="isEdit && !constraints.mirror"
                    type="button"
                    :label="dirty ? 'Save & create rule' : 'Create rule'"
                    icon="pi pi-bolt"
                    link
                    size="small"
                    class="!p-0"
                    :loading="createRuleLoading"
                    :disabled="disabled"
                    @click="emit('createRule')"
                />
            </div>
            <CategoriesCategorySelect
                v-model="values.categoryId"
                v-model:pending-name="pendingName"
                creatable
                :pending-color="pendingCategory?.color"
                input-id="tx-category"
                :keep-id="initialValues.categoryId ?? undefined"
                show-clear
                :disabled="disabled || isLocked('categoryId')"
            />
        </div>

        <div
            v-if="values.type === 'transfer'"
            class="flex flex-col gap-1"
        >
            <div class="flex items-center gap-2">
                <span :class="labelClass">Transfer direction</span>
                <LockHint
                    v-if="isLocked('transferDirection')"
                    :tooltip="directionTooltip"
                />
            </div>
            <SelectButton
                v-model="values.transferDirection"
                :options="directionOptions"
                option-label="label"
                option-value="value"
                :allow-empty="false"
                :disabled="disabled || isLocked('transferDirection')"
                aria-label="Transfer direction"
                class="flex w-full"
                :pt="{ pcToggleButton: { root: { class: 'flex-1' } } }"
            />
            <div
                v-if="!constraints.mirror"
                class="mt-2 flex flex-col gap-1"
            >
                <div class="flex items-center gap-2">
                    <label
                        for="tx-counterpart"
                        :class="labelClass"
                    >
                        {{ counterpartLabel(values.transferDirection) }}
                        <span class="font-normal text-surface-500 dark:text-surface-400">(optional)</span>
                    </label>
                    <LockHint
                        v-if="isLocked('counterpart')"
                        :tooltip="lockTooltip"
                    />
                </div>
                <Select
                    v-model="values.counterpartAccountId"
                    input-id="tx-counterpart"
                    :options="walletOptions"
                    option-label="name"
                    option-value="id"
                    show-clear
                    placeholder="No account"
                    fluid
                    :disabled="disabled || isLocked('counterpart')"
                >
                    <template #option="slotProps">
                        <div class="flex w-full items-center gap-2">
                            <div
                                v-if="slotProps.option.color"
                                class="h-4 w-4 rounded-full"
                                :style="{ backgroundColor: slotProps.option.color }"
                            ></div>
                            <span>{{ slotProps.option.name }}</span>
                            <span class="ml-auto text-sm text-muted-color">{{
                                accountTypeCaption(slotProps.option.type)
                            }}</span>
                        </div>
                    </template>
                </Select>
                <Button
                    v-if="canCreateWallet && !isLocked('counterpart')"
                    type="button"
                    :label="`Create Cash (${neededCurrency?.code})`"
                    icon="pi pi-plus"
                    link
                    size="small"
                    class="self-start !p-0"
                    :loading="createAccount.isPending.value"
                    :disabled="disabled"
                    @click="createWallet"
                />
                <small
                    v-if="walletError"
                    :class="errorClass"
                    role="alert"
                >
                    {{ walletError }}
                </small>
            </div>
            <div
                v-if="values.counterpartAccountId"
                class="flex flex-col gap-1"
            >
                <label
                    for="tx-counterpart-amount"
                    :class="labelClass"
                >
                    Amount received
                </label>
                <InputNumber
                    v-model="values.counterpartAmount"
                    input-id="tx-counterpart-amount"
                    mode="decimal"
                    locale="en-US"
                    :min-fraction-digits="2"
                    :max-fraction-digits="2"
                    :min="0"
                    :suffix="walletCurrency ? ` ${walletCurrency.symbol}` : undefined"
                    fluid
                    :disabled="disabled || isLocked('counterpart')"
                    :invalid="!!showError('counterpartAmount')"
                    @input="counterpartAmountTouched = true"
                    @blur="markTouched('counterpartAmount')"
                />
                <small
                    v-if="showError('counterpartAmount')"
                    :class="errorClass"
                    role="alert"
                >
                    {{ showError("counterpartAmount") }}
                </small>
            </div>
        </div>

        <div class="flex flex-col gap-1">
            <div class="flex items-center gap-2">
                <label
                    for="tx-additional-description"
                    :class="labelClass"
                >
                    Additional description
                </label>
                <LockHint
                    v-if="isLocked('additionalDescription')"
                    :tooltip="lockTooltip"
                />
            </div>
            <InputText
                id="tx-additional-description"
                v-model="values.additionalDescription"
                fluid
                :maxlength="TRANSACTION_ADDITIONAL_DESCRIPTION_MAX_LENGTH"
                :disabled="disabled || isLocked('additionalDescription')"
                :invalid="!!showError('additionalDescription')"
                @blur="markTouched('additionalDescription')"
            />
            <small :class="helperClass">Extra detail, like what a bank adds</small>
            <small
                v-if="showError('additionalDescription')"
                :class="errorClass"
            >
                {{ showError("additionalDescription") }}
            </small>
        </div>

        <div class="flex flex-col gap-1">
            <label
                for="tx-notes"
                :class="labelClass"
            >
                Notes
            </label>
            <Textarea
                id="tx-notes"
                v-model="values.notes"
                auto-resize
                :rows="3"
                fluid
                :maxlength="TRANSACTION_NOTES_MAX_LENGTH"
                :disabled="disabled"
                :invalid="!!showError('notes')"
                @blur="markTouched('notes')"
            />
            <small
                v-if="notesLength >= NOTES_COUNTER_FROM"
                :class="[helperClass, 'self-end']"
            >
                {{ notesLength }}/{{ TRANSACTION_NOTES_MAX_LENGTH }}
            </small>
            <small
                v-if="showError('notes')"
                :class="errorClass"
            >
                {{ showError("notes") }}
            </small>
        </div>

        <div class="flex items-center gap-2">
            <ToggleSwitch
                v-model="values.hidden"
                input-id="tx-hidden"
                :disabled="disabled || isLocked('hidden')"
            />
            <label
                for="tx-hidden"
                class="text-sm text-surface-700 dark:text-surface-200"
            >
                Hidden
            </label>
            <LockHint
                v-if="isLocked('hidden')"
                :tooltip="lockTooltip"
            />
            <button
                v-tooltip.top.focus="'Excluded from the visible list, budgets, reports and Transferred/Available.'"
                type="button"
                class="inline-flex items-center rounded-full text-surface-500 dark:text-surface-400"
                aria-label="About hidden transactions"
                @mouseenter="($event.currentTarget as HTMLElement).focus()"
                @mouseleave="($event.currentTarget as HTMLElement).blur()"
                @click="($event.currentTarget as HTMLElement).focus()"
            >
                <i
                    class="pi pi-question-circle"
                    aria-hidden="true"
                ></i>
            </button>
        </div>
    </form>
</template>
