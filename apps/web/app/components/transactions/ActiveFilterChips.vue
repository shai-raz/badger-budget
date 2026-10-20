<script setup lang="ts">
import type { ActiveFilterChip } from "../../composables/transactions/useTransactionFilters";

defineProps<{
    chips: ActiveFilterChip[];
}>();
</script>

<template>
    <div class="flex flex-wrap items-center gap-2">
        <Chip
            v-for="chip in chips"
            :key="chip.key"
            :label="chip.label"
            :icon="`pi ${chip.icon}`"
            removable
            remove-icon="pi pi-times"
            :aria-label="`Clear ${chip.label} filter`"
            @remove="chip.clear()"
        />
    </div>
</template>
