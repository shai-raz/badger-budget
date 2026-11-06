<script setup lang="ts">
/**
 * The Filters button that opens the drawer or sheet of drawer filters. Icon-only: a 36px square while no drawer filter
 * is active, widening to a pill with an info badge carrying the count once one is.
 */
defineProps<{
    /** Active drawer filters (types, accounts, categories, hidden); the period is not counted. */
    count: number;
    /** Whether the drawer or sheet it opens is open. */
    expanded: boolean;
}>();

const emit = defineEmits<{ (event: "click"): void }>();
</script>

<template>
    <Button
        icon="pi pi-sliders-h"
        size="small"
        severity="secondary"
        outlined
        class="h-9 shrink-0"
        :class="{ 'w-9': count === 0 }"
        :badge="count > 0 ? String(count) : undefined"
        badge-severity="info"
        :aria-label="count > 0 ? `Filters, ${count} active` : 'Filters'"
        aria-haspopup="dialog"
        :aria-expanded="expanded"
        @click="emit('click')"
    />
</template>
