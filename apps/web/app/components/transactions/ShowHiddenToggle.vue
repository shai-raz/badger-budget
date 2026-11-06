<script setup lang="ts">
/**
 * The eye toggle that includes hidden accounts' transactions in the list. Pressed while it is on. The `pill` variant
 * (mobile chip row) matches the filter pills: rounded, never outlined.
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
        :severity="showHidden ? undefined : 'secondary'"
        :outlined="props.variant === 'button' && !showHidden"
        :class="props.variant === 'pill' ? 'rounded-full' : undefined"
        :aria-pressed="showHidden"
        :aria-label="LABEL"
        @click="toggle()"
    />
</template>
