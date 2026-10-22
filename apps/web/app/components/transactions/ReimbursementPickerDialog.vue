<script setup lang="ts">
import type { IReimbursementCandidate } from "@badger/types";
import { useToast } from "primevue/usetoast";
import ReimbursementCandidateRow from "./ReimbursementCandidateRow.vue";
import EmptyState from "../shared/EmptyState.vue";
import { useReimbursementPicker } from "../../composables/transactions/useReimbursementPicker";
import { useCreateReimbursement, useReimbursementCandidates } from "../../composables/transactions/useReimbursements";
import { getApiErrorMessage } from "../../utils/apiError";
import { formatCurrency } from "../../utils/currency";
import { defaultApplyAmount, otherGroupLabel, remainingCaption, suggestedHeading } from "../../utils/reimbursement";

// Mounted once in layouts/app.vue. Open it through useReimbursementPicker() from any row or page.
const { state, close } = useReimbursementPicker();
const toast = useToast();

const transactionId = computed(() => state.value.transactionId);
const search = ref("");
const selectedId = ref<string | null>(null);
const applyAmount = ref<number | null>(null);
const apiError = ref<string | null>(null);
const groupRef = ref<HTMLElement | null>(null);

// The layout keeps this dialog mounted, so only fetch while it is actually open.
const { data, isFetching, isError } = useReimbursementCandidates(
    transactionId,
    search,
    computed(() => state.value.visible),
);
const { mutateAsync, isPending } = useCreateReimbursement();

// Keep-previous-data can briefly return the last transaction's list; only trust a response for this one.
const response = computed(() => {
    const value = data.value;
    return value && value.source.id === transactionId.value ? value : null;
});
const source = computed(() => response.value?.source ?? null);
const suggested = computed(() => response.value?.suggested ?? []);
const other = computed(() => response.value?.other ?? []);
const allCandidates = computed(() => [...suggested.value, ...other.value]);

const selected = computed(() => allCandidates.value.find((candidate) => candidate.id === selectedId.value) ?? null);
// The first row is the tab stop until something is selected; the selected row takes over after that.
const tabStopId = computed(() => selected.value?.id ?? allCandidates.value[0]?.id ?? null);

const applyMax = computed(() =>
    source.value && selected.value ? defaultApplyAmount(source.value.remaining, selected.value.remaining) : 0,
);

// Compare in cents so float noise can't reject a value that is exactly the cap.
const isValid = computed(() => {
    if (applyAmount.value === null || !selected.value) return false;
    const cents = Math.round(applyAmount.value * 100);
    return cents >= 1 && cents <= Math.round(applyMax.value * 100);
});

const canSave = computed(() => !!selected.value && isValid.value);

const resetSelection = () => {
    selectedId.value = null;
    applyAmount.value = null;
};

const select = (candidate: IReimbursementCandidate) => {
    if (!source.value) return;
    selectedId.value = candidate.id;
    applyAmount.value = defaultApplyAmount(source.value.remaining, candidate.remaining);
};

// Each open starts clean: no search, no selection, no stale error.
watch(
    () => state.value.openCount,
    () => {
        search.value = "";
        resetSelection();
        apiError.value = null;
    },
);

// A search that filters the selected row out of the list drops the selection, so Link can't act on a hidden row.
watch(response, (value) => {
    if (!value || !selectedId.value) return;
    const stillListed = [...value.suggested, ...value.other].some((candidate) => candidate.id === selectedId.value);
    if (!stillListed) resetSelection();
});

const onGroupKeydown = (event: KeyboardEvent) => {
    const step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[event.key];
    if (step === undefined || !groupRef.value) return;

    const rows = Array.from(groupRef.value.querySelectorAll<HTMLElement>('[role="radio"]'));
    const current = (event.target as HTMLElement).closest<HTMLElement>('[role="radio"]');
    const index = current ? rows.indexOf(current) : -1;
    const next = rows[(index + step + rows.length) % rows.length];
    if (!next) return;

    event.preventDefault();
    next.focus();
    const candidate = allCandidates.value.find((item) => item.id === next.dataset.candidateId);
    if (candidate) select(candidate);
};

const onVisibleChange = (value: boolean) => {
    if (!value) close();
};

const handleSave = async () => {
    const sourceRow = source.value;
    const candidate = selected.value;
    if (!sourceRow || !candidate || applyAmount.value === null || !isValid.value) return;
    apiError.value = null;

    // The source is whichever side the picker was opened from; the candidate is the other side.
    const link =
        sourceRow.type === "expense"
            ? { expenseId: sourceRow.id, incomeId: candidate.id }
            : { incomeId: sourceRow.id, expenseId: candidate.id };

    try {
        await mutateAsync({ ...link, amount: applyAmount.value });
        close();
        toast.add({ severity: "success", summary: "Reimbursement linked", life: 3000 });
    } catch (error) {
        apiError.value = getApiErrorMessage(error, "Could not link the reimbursement");
    }
};
</script>

<template>
    <SharedFormDialog
        :visible="state.visible"
        header="Link reimbursement"
        initial-focus="field"
        save-label="Link"
        :busy="isPending"
        :api-error="apiError"
        :show-save="!!source"
        :save-disabled="!canSave"
        @update:visible="onVisibleChange"
        @hide="apiError = null"
        @save="handleSave"
    >
        <div
            v-if="!source"
            class="flex justify-center py-8"
        >
            <Message
                v-if="isError"
                severity="error"
                :closable="false"
                >Could not load the transactions to link.</Message
            >
            <ProgressSpinner
                v-else
                style="width: 2.5rem; height: 2.5rem"
            />
        </div>

        <template v-else>
            <div class="flex flex-col gap-1 rounded-lg bg-surface-50 p-3 dark:bg-surface-800">
                <div class="flex items-baseline justify-between gap-3">
                    <span class="min-w-0 truncate font-semibold">{{ source.description }}</span>
                    <span class="shrink-0 font-semibold tabular-nums">{{
                        formatCurrency(source.amount, source.currencyCode)
                    }}</span>
                </div>
                <span class="text-xs text-muted-color">{{
                    remainingCaption(source.type, source.remaining, source.currencyCode)
                }}</span>
            </div>

            <InputText
                v-model="search"
                autofocus
                fluid
                placeholder="Search description, category or amount"
                aria-label="Search transactions to link"
                :disabled="isPending"
            />

            <!-- Above the list, so a long list never hides the amount the user just picked a row for. -->
            <div
                v-if="selected"
                class="flex flex-col gap-2"
            >
                <label
                    for="reimbursement-apply-amount"
                    class="text-sm font-medium"
                    >Amount to apply</label
                >
                <InputNumber
                    v-model="applyAmount"
                    input-id="reimbursement-apply-amount"
                    mode="decimal"
                    locale="en-US"
                    :min-fraction-digits="2"
                    :max-fraction-digits="2"
                    :min="0.01"
                    :max="applyMax"
                    fluid
                    :invalid="applyAmount !== null && !isValid"
                    :disabled="isPending"
                />
                <small class="text-muted-color">Up to {{ formatCurrency(applyMax, source.currencyCode) }}.</small>
            </div>

            <div
                ref="groupRef"
                role="radiogroup"
                aria-label="Transactions to link"
                class="flex flex-col gap-2"
                :aria-busy="isFetching"
                @keydown="onGroupKeydown"
            >
                <p
                    v-if="suggested.length"
                    class="m-0 text-xs font-semibold text-muted-color"
                >
                    {{ suggestedHeading(source.type, source.remaining, source.currencyCode) }}
                </p>
                <ReimbursementCandidateRow
                    v-for="candidate in suggested"
                    :key="candidate.id"
                    :data-candidate-id="candidate.id"
                    :candidate="candidate"
                    :selected="candidate.id === selectedId"
                    :tabbable="candidate.id === tabStopId"
                    @select="select(candidate)"
                />

                <Divider
                    v-if="other.length"
                    align="left"
                >
                    <span class="text-xs font-semibold text-muted-color">{{ otherGroupLabel(source.type) }}</span>
                </Divider>
                <ReimbursementCandidateRow
                    v-for="candidate in other"
                    :key="candidate.id"
                    :data-candidate-id="candidate.id"
                    :candidate="candidate"
                    :selected="candidate.id === selectedId"
                    :tabbable="candidate.id === tabStopId"
                    @select="select(candidate)"
                />

                <EmptyState
                    v-if="!allCandidates.length && !isFetching"
                    icon="pi-search"
                    :text="search.trim() ? 'No transactions match that search.' : 'Nothing to link yet.'"
                />
            </div>
        </template>
    </SharedFormDialog>
</template>
