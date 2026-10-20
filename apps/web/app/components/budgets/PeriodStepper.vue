<script setup lang="ts">
import type { BudgetPeriod } from "~/utils/budget";
import { budgetCurrentPeriodLabel, budgetPeriodNoun } from "~/utils/budget";

/**
 * Prev/next controls for a budget band. The window's label lives in the band's label row, so this
 * renders only the controls. "This month" (or the period's equivalent) appears only off the current
 * window, and Next is disabled there. Targets are 36px.
 */
defineProps<{
    period: BudgetPeriod;
    // True when viewing the in-progress window; forward nav is blocked here.
    atCurrent: boolean;
}>();

const emit = defineEmits<{
    prev: [];
    next: [];
    reset: [];
}>();
</script>

<template>
    <div class="-my-2 -mr-2 flex items-center gap-0.5 normal-case">
        <button
            v-if="!atCurrent"
            type="button"
            class="mr-1 text-xs font-semibold text-primary hover:underline"
            @click="emit('reset')"
        >
            {{ budgetCurrentPeriodLabel(period) }}
        </button>
        <Button
            icon="pi pi-chevron-left"
            text
            rounded
            severity="secondary"
            class="h-9 w-9"
            :aria-label="`Previous ${budgetPeriodNoun(period)}`"
            @click="emit('prev')"
        />
        <Button
            icon="pi pi-chevron-right"
            text
            rounded
            severity="secondary"
            class="h-9 w-9"
            :aria-label="`Next ${budgetPeriodNoun(period)}`"
            :disabled="atCurrent"
            @click="emit('next')"
        />
    </div>
</template>
