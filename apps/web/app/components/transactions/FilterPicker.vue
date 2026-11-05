<script setup lang="ts" generic="T extends string">
/**
 * One transaction filter on the desktop toolbar: a trigger that summarises the selection, a clear button while
 * something is selected, and a popover holding the option list. The trigger label and avatar come from the selection;
 * an empty selection means "all".
 */
import { FILTER_COPY, filterSelectionLabel, type FilterNoun } from "~/utils/filterLabels";
import type { FilterOption } from "~/utils/filterOptions";

const props = defineProps<{
    noun: FilterNoun;
    options: FilterOption<T>[];
}>();

const selected = defineModel<T[]>("selected", { required: true });

const selectedOptions = computed(() => props.options.filter((option) => selected.value.includes(option.value)));
const label = computed(() => filterSelectionLabel(props.noun, selectedOptions.value) ?? FILTER_COPY[props.noun].title);
const active = computed(() => selected.value.length > 0);
const onlySelected = computed(() => (selectedOptions.value.length === 1 ? selectedOptions.value[0] : undefined));

// Idle controls are outlined; an active one fills with the primary colour so a filtered toolbar reads at a glance.
const severity = computed(() => (active.value ? undefined : "secondary"));

const open = ref(false);
const popover = ref<{ toggle: (event: Event) => void; hide: () => void } | null>(null);
</script>

<template>
    <ButtonGroup class="min-w-0">
        <Button
            size="small"
            :severity="severity"
            :outlined="!active"
            aria-haspopup="dialog"
            :aria-expanded="open"
            class="min-w-0"
            @click="popover?.toggle($event)"
        >
            <TransactionsFilterOptionAvatar
                v-if="onlySelected"
                :avatar="onlySelected.avatar"
                size="xs"
            />
            <span class="max-w-[120px] truncate">{{ label }}</span>
            <i
                class="pi pi-chevron-down text-xs"
                aria-hidden="true"
            ></i>
        </Button>
        <Button
            v-if="active"
            icon="pi pi-times"
            size="small"
            :aria-label="`Clear ${noun} filter`"
            @click="selected = []"
        />

        <Popover
            ref="popover"
            :pt="{ content: { class: 'p-1.5' } }"
            @show="open = true"
            @hide="open = false"
        >
            <div class="w-72">
                <TransactionsFilterOptionList
                    v-model:selected="selected"
                    :options="options"
                    :all-label="FILTER_COPY[noun].allLabel"
                />
            </div>
        </Popover>
    </ButtonGroup>
</template>
