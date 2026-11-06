<script setup lang="ts" generic="T extends string">
/**
 * One transaction filter. The `button` variant (desktop toolbar) is a trigger that summarises the selection, a clear
 * button while something is selected, and a popover holding the option list. The `pill` variant (mobile chip row) is
 * one trigger with no clear button, opening a bottom sheet with the same option list. The trigger label and avatar
 * come from the selection; an empty selection means "all". Both variants apply changes live.
 */
import { FILTER_COPY, filterSelectionLabel, type FilterNoun } from "~/utils/filterLabels";
import type { FilterOption } from "~/utils/filterOptions";

const props = withDefaults(
    defineProps<{
        noun: FilterNoun;
        options: FilterOption<T>[];
        variant?: "button" | "pill";
    }>(),
    { variant: "button" },
);

const selected = defineModel<T[]>("selected", { required: true });

const selectedOptions = computed(() => props.options.filter((option) => selected.value.includes(option.value)));
const label = computed(() => filterSelectionLabel(props.noun, selectedOptions.value) ?? FILTER_COPY[props.noun].title);
const active = computed(() => selected.value.length > 0);
const onlySelected = computed(() => (selectedOptions.value.length === 1 ? selectedOptions.value[0] : undefined));

// Idle controls are outlined; an active one fills with the primary colour so a filtered toolbar reads at a glance.
// A pill is never outlined: idle grey and filled primary when active, with the button radius like the rest of the row.
const severity = computed(() => (active.value ? undefined : "secondary"));

const open = ref(false);
const popover = ref<{ toggle: (event: Event) => void; hide: () => void } | null>(null);
const triggerEl = ref<{ $el: HTMLElement } | null>(null);
const panelEl = ref<HTMLElement | null>(null);
// Vue clears a template ref as the content starts to leave, before onHide runs, so keep the panel the popover showed.
let shownPanel: HTMLElement | null = null;

const sheetOpen = ref(false);
const expanded = computed(() => (props.variant === "pill" ? sheetOpen.value : open.value));

function onShow() {
    open.value = true;
    shownPanel = panelEl.value;
}

// A close from outside the popover (a click on its non-focusable padding, or PrimeVue's Escape) can leave focus on
// <body>, where the next Escape reaches no handler. Hand focus back to the trigger.
function onHide() {
    open.value = false;
    const active = document.activeElement;
    if (!active || active === document.body || shownPanel?.contains(active)) triggerEl.value?.$el.focus();
}

// The sheet has no focus return of its own, so hand focus back to the pill once it closes, however it closed.
watch(sheetOpen, (isOpen, wasOpen) => {
    if (wasOpen && !isOpen) nextTick(() => triggerEl.value?.$el.focus());
});

function onTriggerClick(event: Event) {
    if (props.variant === "pill") sheetOpen.value = true;
    else popover.value?.toggle(event);
}

// The × unmounts once the selection empties, taking its focus with it; send focus to the trigger instead.
function clear() {
    selected.value = [];
    nextTick(() => triggerEl.value?.$el.focus());
}
</script>

<template>
    <ButtonGroup class="min-w-0">
        <Button
            ref="triggerEl"
            size="small"
            :severity="severity"
            :outlined="variant === 'button' && !active"
            class="h-9 min-w-0"
            aria-haspopup="dialog"
            :aria-expanded="expanded"
            @click="onTriggerClick"
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
            v-if="active && variant === 'button'"
            icon="pi pi-times"
            size="small"
            class="h-9 w-9"
            :aria-label="`Clear ${noun} filter`"
            @click="clear"
        />

        <Popover
            v-if="variant === 'button'"
            ref="popover"
            :pt="{ content: { class: 'p-1.5' } }"
            @show="onShow"
            @hide="onHide"
        >
            <div
                ref="panelEl"
                class="w-72"
            >
                <TransactionsFilterOptionList
                    v-model:selected="selected"
                    :options="options"
                    :all-label="FILTER_COPY[noun].allLabel"
                    autofocus-first
                />
            </div>
        </Popover>

        <!-- The pill's list in a sheet: the sheet's own title row is hidden, and the list carries the title with Invert
             and Clear, so the heading and its actions read as one row. -->
        <SharedBottomSheet
            v-if="variant === 'pill'"
            v-model:visible="sheetOpen"
            :title="FILTER_COPY[noun].title"
            hide-title
        >
            <TransactionsFilterOptionList
                v-model:selected="selected"
                :options="options"
                :all-label="FILTER_COPY[noun].allLabel"
                :title="FILTER_COPY[noun].title"
                actions-placement="header"
                dense
            />
            <template #footer>
                <Button
                    label="Show results"
                    class="w-full"
                    @click="sheetOpen = false"
                />
            </template>
        </SharedBottomSheet>
    </ButtonGroup>
</template>
