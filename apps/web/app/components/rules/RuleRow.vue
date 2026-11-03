<script setup lang="ts">
/**
 * One row on the Rules page: name, the rule's sentence, its on/off switch and the ⋮ trigger. A click on the
 * row opens it for editing, unless the row is reordering. The row reports intent only; the page owns the
 * mutations and the shared ⋮ menu. An off rule dims its text. While reordering, the switch and ⋮ give way
 * to the `move` slot.
 */
import type { IRule } from "@badger/types";
import { ruleSentenceParts, type RuleDisplayContext } from "~/utils/ruleSentence";
import RuleSentence from "./RuleSentence.vue";

const props = withDefaults(
    defineProps<{
        rule: IRule;
        context: RuleDisplayContext;
        reordering?: boolean;
    }>(),
    { reordering: false },
);

const emit = defineEmits<{
    toggle: [isActive: boolean];
    actions: [event: Event];
    open: [];
}>();

const parts = computed(() => ruleSentenceParts(props.rule, props.context));

const onRowClick = () => {
    if (!props.reordering) emit("open");
};
</script>

<template>
    <div
        class="flex items-center gap-3 px-4 py-3 md:px-0"
        :class="{ 'cursor-pointer': !reordering }"
        @click="onRowClick"
    >
        <slot name="grip" />
        <div
            class="flex min-w-0 flex-1 flex-col gap-1"
            :class="{ 'opacity-60': !rule.isActive }"
        >
            <span class="truncate text-sm font-semibold">{{ rule.name }}</span>
            <RuleSentence :parts="parts" />
        </div>
        <template v-if="reordering">
            <slot name="move" />
        </template>
        <template v-else>
            <ToggleSwitch
                :model-value="rule.isActive"
                aria-label="Rule on"
                @click.stop
                @update:model-value="emit('toggle', $event)"
            />
            <Button
                icon="pi pi-ellipsis-v"
                text
                rounded
                size="small"
                aria-label="Rule actions"
                class="shrink-0 text-muted-color"
                @click.stop="emit('actions', $event)"
            />
        </template>
    </div>
</template>
