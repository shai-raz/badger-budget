<script setup lang="ts">
import { paletteSwatchFor } from "~/utils/colorSwatches";
import { NEW_CATEGORY_PALETTE } from "~/utils/pendingCategory";

const props = defineProps<{
    modelValue: string;
}>();

const emit = defineEmits<{
    "update:modelValue": [value: string];
}>();

// Ensure color value always has # prefix
const ensureHashPrefix = (color: string): string => {
    if (!color) return "#3B82F6";
    return color.startsWith("#") ? color : `#${color}`;
};

const colorValue = computed({
    get: () => props.modelValue,
    set: (value: string) => {
        const normalizedValue = ensureHashPrefix(value);
        emit("update:modelValue", normalizedValue);
    },
});

// The custom row shows for a colour off the palette, or once the user asks for Custom.
const customRequested = ref(false);
const selectedSwatch = computed(() => paletteSwatchFor(props.modelValue));
const showCustom = computed(() => customRequested.value || selectedSwatch.value === null);

function isSwatchSelected(swatch: string): boolean {
    return !showCustom.value && selectedSwatch.value === swatch;
}

function pickSwatch(swatch: string) {
    customRequested.value = false;
    colorValue.value = swatch;
}

defineExpose({
    isValidHexColor: () => /^#[0-9A-Fa-f]{6}$/.test(colorValue.value),
});
</script>

<template>
    <div class="flex flex-col gap-3">
        <div class="flex flex-wrap gap-2">
            <button
                v-for="swatch in NEW_CATEGORY_PALETTE"
                :key="swatch"
                type="button"
                class="h-7 w-7 rounded-full outline-none ring-offset-1 ring-offset-surface-0 focus-visible:ring-2 focus-visible:ring-primary dark:ring-offset-surface-900"
                :class="isSwatchSelected(swatch) && 'ring-2 ring-primary'"
                :style="{ backgroundColor: swatch }"
                :aria-label="swatch"
                :aria-pressed="isSwatchSelected(swatch)"
                @click="pickSwatch(swatch)"
            />
            <button
                type="button"
                class="flex h-7 w-7 items-center justify-center rounded-full border border-surface-300 bg-surface-0 text-muted-color outline-none ring-offset-1 ring-offset-surface-0 focus-visible:ring-2 focus-visible:ring-primary dark:border-surface-600 dark:bg-surface-900 dark:ring-offset-surface-900"
                :class="showCustom && 'ring-2 ring-primary'"
                aria-label="Custom color"
                :aria-pressed="showCustom"
                @click="customRequested = true"
            >
                <i
                    class="pi pi-palette text-sm"
                    aria-hidden="true"
                ></i>
            </button>
        </div>

        <div
            v-if="showCustom"
            class="flex items-center gap-3"
        >
            <ColorPicker
                v-model="colorValue"
                format="hex"
                @update:model-value="customRequested = true"
            />
            <InputText
                v-model="colorValue"
                placeholder="#3B82F6"
                aria-label="Hex color"
                class="flex-1"
                @update:model-value="customRequested = true"
            />
        </div>
    </div>
</template>
