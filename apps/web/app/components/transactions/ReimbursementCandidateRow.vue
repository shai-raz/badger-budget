<script setup lang="ts">
import type { IReimbursementCandidate } from "@badger/types";
import { formatCurrency } from "../../utils/currency";
import { candidateMetaLine } from "../../utils/reimbursement";

/**
 * One selectable link candidate in the reimbursement picker. It is a radio in a
 * `role="radiogroup"` (the group owns the arrow-key roving). Enter and Space select.
 */
const props = defineProps<{
    candidate: IReimbursementCandidate;
    selected: boolean;
    /** Roving tab stop: the selected row, or the first row when nothing is selected. */
    tabbable: boolean;
}>();

const emit = defineEmits<{
    select: [];
}>();

const meta = computed(() => candidateMetaLine(props.candidate));

const onKeydown = (event: KeyboardEvent) => {
    if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        emit("select");
    }
};
</script>

<template>
    <div
        role="radio"
        :aria-checked="selected"
        :tabindex="tabbable ? 0 : -1"
        class="flex cursor-pointer flex-col gap-0.5 rounded-lg border px-3 py-2.5 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary"
        :class="
            selected
                ? 'border-primary bg-surface-100 ring-1 ring-primary dark:bg-surface-800'
                : 'border-surface-200 hover:bg-surface-50 dark:border-surface-700 dark:hover:bg-surface-800/60'
        "
        @click="emit('select')"
        @keydown="onKeydown"
    >
        <div class="flex min-w-0 items-baseline gap-3">
            <span class="min-w-0 flex-1 truncate text-sm font-semibold">{{ candidate.description }}</span>
            <span class="shrink-0 font-semibold tabular-nums">{{
                formatCurrency(candidate.amount, candidate.currencyCode)
            }}</span>
        </div>
        <span
            v-if="meta"
            class="truncate text-xs text-muted-color"
            >{{ meta }}</span
        >
    </div>
</template>
