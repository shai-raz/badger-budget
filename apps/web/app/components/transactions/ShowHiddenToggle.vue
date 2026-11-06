<script setup lang="ts">
/**
 * The eye toggle that includes hidden accounts' transactions in the list. Pressed while it is on: outlined while
 * off and filled while on, like the filter pickers beside it.
 */
const showHidden = defineModel<boolean>({ required: true });

const LABEL = "Show hidden transactions";

function toggle(): void {
    showHidden.value = !showHidden.value;
}
</script>

<template>
    <Button
        v-tooltip.bottom="LABEL"
        icon="pi pi-eye"
        size="small"
        class="h-9 w-9"
        :severity="showHidden ? undefined : 'secondary'"
        :outlined="!showHidden"
        :aria-pressed="showHidden"
        :aria-label="LABEL"
        @click="toggle()"
    />
</template>
