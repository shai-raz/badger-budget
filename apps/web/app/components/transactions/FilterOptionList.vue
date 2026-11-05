<script setup lang="ts" generic="T extends string">
/**
 * The option list behind every transaction filter picker: an All row, a divider, one checkbox row per option, and the
 * Invert and Clear actions. The desktop popovers and the mobile sheets both use it. Selection math lives in
 * `useFilterToggle`; this component only draws it.
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
}

const props = withDefaults(defineProps<Props>(), {
    actionsPlacement: "footer",
    title: undefined,
    dense: false,
});

const selected = defineModel<T[]>("selected", { required: true });

const { canInvert, isAllActive, isSelected, toggle, selectAll, invert } = useFilterToggle(
    selected,
    () => props.options,
);

const ROW_BASE =
    "flex w-full items-center gap-2.5 rounded-md px-2 text-left text-sm text-surface-900 hover:bg-surface-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary dark:text-surface-0 dark:hover:bg-surface-800";
const ROW_HEIGHT = computed(() => (props.dense ? "min-h-11" : "min-h-9"));
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
            <button
                type="button"
                :class="[ROW_BASE, ROW_HEIGHT, isAllActive && 'font-semibold']"
                :aria-pressed="isAllActive"
                @click="selectAll()"
            >
                <i
                    class="pi pi-check w-4 shrink-0 text-xs"
                    :class="{ invisible: !isAllActive }"
                    aria-hidden="true"
                ></i>
                <span class="min-w-0 flex-1 truncate">{{ allLabel }}</span>
            </button>

            <div
                class="my-1 h-px bg-surface-200 dark:bg-surface-700"
                role="separator"
            ></div>

            <button
                v-for="option in options"
                :key="option.value"
                type="button"
                :class="[
                    ROW_BASE,
                    ROW_HEIGHT,
                    isSelected(option.value) && 'font-semibold',
                    option.stale && 'opacity-60',
                ]"
                :aria-pressed="isSelected(option.value)"
                :aria-label="transactionCountLabel(option.label, option.count)"
                @click="toggle(option.value)"
            >
                <!-- Purely visual: the button's aria-label carries the state and count. -->
                <Checkbox
                    :model-value="isSelected(option.value)"
                    :binary="true"
                    :readonly="true"
                    :tabindex="-1"
                    aria-hidden="true"
                    class="pointer-events-none shrink-0"
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
            </button>
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
