<script setup lang="ts">
/**
 * The eye toggle that includes hidden accounts' transactions in the list. Pressed while it is on. The `pill` variant
 * (mobile chip row) matches the filter pills: never outlined, otherwise the same 36px button as the desktop toolbar.
 */
const props = withDefaults(defineProps<{ variant?: "button" | "pill" }>(), { variant: "button" });

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
        :outlined="props.variant === 'button' && !showHidden"
        :aria-pressed="showHidden"
        :aria-label="LABEL"
        @click="toggle()"
    />
</template>
