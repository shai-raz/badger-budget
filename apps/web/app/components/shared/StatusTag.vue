<script setup lang="ts">
/**
 * The one status tag (PrimeVue Tag with the app's size and weight). `neutral`
 * maps to PrimeVue's `secondary` severity; the other tones pass through.
 * Values are sentence case and supplied by the caller.
 */
import type { TagProps } from "primevue/tag";

interface Props {
    value: string;
    tone?: "neutral" | "success" | "warn" | "danger" | "info";
}

const props = withDefaults(defineProps<Props>(), { tone: "neutral" });

const severity = computed<TagProps["severity"]>(() => (props.tone === "neutral" ? "secondary" : props.tone));
</script>

<template>
    <Tag
        :value="value"
        :severity="severity"
        class="px-2 py-0.5 text-xs font-medium"
    />
</template>
