<script setup lang="ts">
import {
    PERIOD_PRESET_LABELS,
    applyGridEmit,
    matchPreset,
    monthKeyOf,
    presetSelection,
    type MonthKey,
    type PeriodPresetId,
    type PeriodSelection,
} from "~/utils/monthRange";

const props = defineProps<{
    presets: readonly PeriodPresetId[];
    layout: "side" | "stacked";
}>();

const selection = defineModel<PeriodSelection>({ required: true });

const emit = defineEmits<{ done: [] }>();

// Captured once per open, so the presets, the disabled future months and the matched preset all agree.
const now = new Date();

// The first month of a range the user has clicked but not yet closed.
const pendingStart = ref<MonthKey | null>(null);

const activePreset = computed(() => matchPreset(selection.value, props.presets, now));

const presetOptions = computed(() => props.presets.map((id) => ({ id, label: PERIOD_PRESET_LABELS[id] })));

const monthStart = (key: MonthKey): Date => {
    const [year = 0, month = 1] = key.split("-").map(Number);
    const date = new Date(0);
    date.setFullYear(year, month - 1, 1);
    date.setHours(0, 0, 0, 0);
    return date;
};

const gridValue = computed<(Date | null)[] | null>(() => {
    if (pendingStart.value !== null) return [monthStart(pendingStart.value), null];
    if (selection.value.kind === "all") return null;
    return [monthStart(selection.value.from), monthStart(selection.value.to)];
});

const commit = (next: PeriodSelection) => {
    pendingStart.value = null;
    selection.value = next;
    emit("done");
};

const choosePreset = (id: PeriodPresetId | null) => {
    if (id === null) return;
    commit(presetSelection(id, now));
};

// PrimeVue's range grid emits `[start, end]`, or `[clicked, null]` when a click starts a new range. The month
// logic in `applyGridEmit` reads both, so the result does not depend on which month was clicked first.
const onGridUpdate = (value: Date | Date[] | (Date | null)[] | null | undefined) => {
    // PrimeVue does not block a click on a future month, and clamps it to the max date (not the 1st). Ignore that.
    if (Array.isArray(value) && value.some((date) => date && date.getDate() !== 1)) return;
    const emitted = Array.isArray(value) ? value.map((date) => (date ? monthKeyOf(date) : null)) : null;
    const [first = null, second = null] = emitted ?? [];
    const result = applyGridEmit(pendingStart.value, emitted === null ? null : [first, second]);

    pendingStart.value = result.pendingStart;
    if (result.commit) selection.value = result.commit;
    if (result.close) emit("done");
};
</script>

<template>
    <div :class="layout === 'side' ? 'flex items-start gap-3' : 'flex flex-col gap-3'">
        <Listbox
            v-if="layout === 'side'"
            :model-value="activePreset"
            :options="presetOptions"
            option-label="label"
            option-value="id"
            class="w-40 shrink-0"
            scroll-height="none"
            :pt="{ root: { class: 'border-0' } }"
            aria-label="Period presets"
            @update:model-value="choosePreset"
        />
        <div
            v-else
            class="flex flex-wrap gap-2"
        >
            <Button
                v-for="option in presetOptions"
                :key="option.id"
                size="small"
                rounded
                :outlined="activePreset !== option.id"
                :severity="activePreset === option.id ? undefined : 'secondary'"
                :label="option.label"
                @click="choosePreset(option.id)"
            />
        </div>
        <DatePicker
            inline
            view="month"
            selection-mode="range"
            date-format="mm/yy"
            :max-date="now"
            :model-value="gridValue"
            aria-label="Month range"
            @update:model-value="onGridUpdate"
        />
    </div>
</template>
