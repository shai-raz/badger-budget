<script setup lang="ts">
/**
 * The one status tag (PrimeVue Tag with the app's size and weight). `neutral`
 * maps to PrimeVue's `secondary` severity; the other tones pass through.
 * Values are sentence case and supplied by the caller. An optional `icon` is a
 * PrimeIcons class (e.g. `pi pi-eye-slash`) rendered before the value.
 */
import type { TagProps } from "primevue/tag";
import type { StatusTagTone } from "~/utils/statusTag";

interface Props {
    value: string;
    tone?: StatusTagTone;
    icon?: string;
}

const props = withDefaults(defineProps<Props>(), { tone: "neutral", icon: undefined });

const severity = computed<TagProps["severity"]>(() => (props.tone === "neutral" ? "secondary" : props.tone));
</script>

<template>
    <Tag
        :value="value"
        :severity="severity"
        :icon="icon"
        class="px-2 py-0.5 text-xs font-medium"
    />
</template>
