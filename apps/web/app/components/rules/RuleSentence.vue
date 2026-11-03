<script setup lang="ts">
/**
 * A rule read as a sentence, e.g. "When description contains starbucks → Coffee, then stop". Values are
 * bold. The sentence wraps rather than truncating, so every condition stays readable.
 */
import type { RuleSentenceParts } from "~/utils/ruleSentence";

defineProps<{ parts: RuleSentenceParts }>();

const STOP_TOOLTIP = "Rules below this one won't run on transactions it matches.";
</script>

<template>
    <p class="break-words text-sm text-muted-color">
        <span
            v-for="(condition, index) in parts.conditions"
            :key="index"
            class="mr-1.5"
        >
            {{ condition.lead }} {{ condition.field }} {{ condition.operator }}
            <b class="font-semibold text-surface-800 dark:text-surface-100">{{ condition.value }}</b>
        </span>
        <span
            v-if="parts.category"
            class="inline-flex max-w-full items-center gap-1.5 align-middle"
        >
            <span aria-hidden="true">→</span>
            <SharedCategoryChip
                :name="parts.category.name"
                :color="parts.category.color"
                :icon="parts.category.icon"
                :show-icon="false"
            />
            <!-- The comma sits on the chip so a wrap never starts the next line with it. -->
            <span
                v-if="parts.stop"
                class="-ml-1.5"
                >,</span
            >
        </span>
        <span
            v-if="parts.stop"
            v-tooltip.top="STOP_TOOLTIP"
            class="ml-1 whitespace-nowrap font-semibold text-color"
            :title="STOP_TOOLTIP"
            ><template v-if="!parts.category">,&nbsp;</template
            ><i
                class="pi pi-stop-circle text-xs"
                aria-hidden="true"
            ></i
            >&nbsp;then stop</span
        >
    </p>
</template>
