<script setup lang="ts" generic="T extends string">
/**
 * The option list behind every transaction filter picker: an All row, a divider, one checkbox row per option, and the
 * Invert and Clear actions. Each row is a PrimeVue Checkbox inside a label. The desktop popovers and the mobile sheets
 * both use it. Selection math lives in `useFilterToggle`; this component only draws it.
 */
import { useFilterToggle } from "~/composables/transactions/useFilterToggle";
import { transactionCountLabel, type FilterOption } from "~/utils/filterOptions";

interface Props {
    options: FilterOption<T>[];
    allLabel: string;
    /** Where Invert and Clear sit: under the list, or on the right of the title row above it. */
    actionsPlacement?: "footer" | "header";
    /** Shown on the left of the header row when the actions are in the header. */
    title?: string;
    /** Sheet rows are taller touch targets. */
    dense?: boolean;
    /** Focus the All row when the list mounts, so a popover's keyboard focus starts inside the list. */
    autofocusFirst?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
    actionsPlacement: "footer",
    title: undefined,
    dense: false,
    autofocusFirst: false,
});

const selected = defineModel<T[]>("selected", { required: true });

const { canInvert, isAllActive, isSelected, toggle, selectAll, invert } = useFilterToggle(
    selected,
    () => props.options,
);

/**
 * A Space press clicks the row's checkbox input. The label cancels that native toggle, and the browser undoes a cancelled
 * toggle only after the click listeners return, so the input would stay unchecked under a ticked box. Set it once that
 * undo has run, so assistive tech reads the same state as the box.
 */
const syncNativeAfter = (event: Event, checked: () => boolean) => {
    const input = (event.currentTarget as HTMLElement | null)?.querySelector("input");
    if (input) setTimeout(() => (input.checked = checked()));
};

const ROW_BASE =
    "flex w-full cursor-pointer select-none items-center gap-2.5 rounded-md px-2 text-left text-sm text-surface-900 hover:bg-surface-100 dark:text-surface-0 dark:hover:bg-surface-800";
const ROW_HEIGHT = computed(() => (props.dense ? "min-h-11" : "min-h-9"));
// Set only when asked, so the default markup carries no autofocus attribute at all.
const allInputPt = computed(() => (props.autofocusFirst ? { input: { autofocus: true } } : undefined));
</script>

<template>
    <div class="flex flex-col">
        <div
            v-if="actionsPlacement === 'header'"
            class="flex items-center justify-between gap-2 pb-2"
        >
            <span
                v-if="title"
                class="text-base font-semibold text-surface-900 dark:text-surface-0"
            >
                {{ title }}
            </span>
            <div class="ml-auto flex items-center gap-1">
                <Button
                    label="Invert"
                    link
                    size="small"
                    :disabled="!canInvert"
                    @click="invert()"
                />
                <Button
                    label="Clear"
                    link
                    size="small"
                    :disabled="isAllActive"
                    @click="selectAll()"
                />
            </div>
        </div>

        <div class="max-h-[300px] overflow-y-auto p-0.5">
            <!--
                Every row is a label around a PrimeVue Checkbox, and the toggle runs in the label's click handler with
                .prevent. Checkbox keeps an internal copy of its value and resyncs it only when modelValue changes, so a
                toggle the selection absorbs (picking the last offered value collapses to All; clicking a checked All)
                leaves the prop unchanged and the box would stay wrong if the native toggle ran. Every click (on the
                box's overlaid input, on the text, or the click the browser dispatches for Space) bubbles to the label,
                and preventDefault cancels both label activation and the native toggle, so exactly one toggle runs and
                the box always mirrors the prop. Do not add @update:model-value to these Checkboxes.
            -->
            <!--
                The All row is a checkbox for one aligned control column. Clicking it while checked is a no-op, because
                All means no filter.
            -->
            <label
                :class="[ROW_BASE, ROW_HEIGHT, isAllActive && 'font-semibold']"
                @click.prevent="
                    selectAll();
                    syncNativeAfter($event, () => isAllActive);
                "
            >
                <Checkbox
                    binary
                    size="small"
                    class="shrink-0"
                    :model-value="isAllActive"
                    :pt="allInputPt"
                />
                <span class="min-w-0 flex-1 truncate">{{ allLabel }}</span>
            </label>

            <div
                class="my-1 h-px bg-surface-200 dark:bg-surface-700"
                role="separator"
            ></div>

            <label
                v-for="option in options"
                :key="option.value"
                :class="[
                    ROW_BASE,
                    ROW_HEIGHT,
                    isSelected(option.value) && 'font-semibold',
                    option.stale && 'opacity-60',
                ]"
                @click.prevent="
                    toggle(option.value);
                    syncNativeAfter($event, () => isSelected(option.value));
                "
            >
                <Checkbox
                    binary
                    size="small"
                    class="shrink-0"
                    :model-value="isSelected(option.value)"
                    :aria-label="transactionCountLabel(option.label, option.count)"
                />
                <TransactionsFilterOptionAvatar
                    :avatar="option.avatar"
                    size="xs"
                />
                <span class="min-w-0 flex-1 truncate">{{ option.label }}</span>
                <span
                    v-if="option.count !== undefined"
                    class="ml-auto text-xs tabular-nums text-muted-color"
                    aria-hidden="true"
                    >{{ option.count }}</span
                >
            </label>
        </div>

        <div
            v-if="actionsPlacement === 'footer'"
            class="mt-1 flex items-center justify-end gap-1 border-t border-surface-200 px-1 pt-2 dark:border-surface-700"
        >
            <Button
                label="Invert"
                link
                size="small"
                :disabled="!canInvert"
                @click="invert()"
            />
            <Button
                label="Clear"
                link
                size="small"
                :disabled="isAllActive"
                @click="selectAll()"
            />
        </div>
    </div>
</template>
