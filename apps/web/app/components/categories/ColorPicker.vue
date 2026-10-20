<script setup lang="ts">
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

defineExpose({
    isValidHexColor: () => /^#[0-9A-Fa-f]{6}$/.test(colorValue.value),
});
</script>

<template>
    <div class="flex items-center gap-3">
        <ColorPicker
            v-model="colorValue"
            format="hex"
        />
        <InputText
            v-model="colorValue"
            placeholder="#3B82F6"
            class="flex-1"
        />
    </div>
</template>
