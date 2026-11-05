<script setup lang="ts">
/** The eye toggle that includes hidden accounts' transactions in the list. Pressed while it is on. */
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
        :severity="showHidden ? undefined : 'secondary'"
        :outlined="!showHidden"
        :aria-pressed="showHidden"
        :aria-label="LABEL"
        @click="toggle()"
    />
</template>
