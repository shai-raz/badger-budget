<script setup lang="ts">
// A password-shaped text field that never uses `type="password"`, so browsers/password
// managers don't treat it as a login credential and offer to save/autofill it. Masking is
// done visually via `-webkit-text-security` instead. Use for secrets that aren't account
// passwords (e.g. a local encryption PIN) — see issue #140.
defineProps<{
    modelValue: string;
    placeholder?: string;
}>();

defineEmits<{
    "update:modelValue": [value: string];
    keyupEnter: [];
}>();

const revealed = ref(false);
</script>

<template>
    <IconField>
        <InputText
            :model-value="modelValue"
            type="text"
            autocomplete="off"
            autocapitalize="off"
            autocorrect="off"
            spellcheck="false"
            data-1p-ignore="true"
            data-lpignore="true"
            data-bwignore="true"
            class="w-full"
            :class="{ 'masked-text': !revealed }"
            :placeholder="placeholder"
            @update:model-value="$emit('update:modelValue', $event ?? '')"
            @keyup.enter="$emit('keyupEnter')"
        />
        <InputIcon
            :class="revealed ? 'pi pi-eye-slash' : 'pi pi-eye'"
            class="cursor-pointer"
            role="button"
            tabindex="0"
            :aria-label="revealed ? 'Hide value' : 'Show value'"
            @click="revealed = !revealed"
            @keydown.enter="revealed = !revealed"
            @keydown.space.prevent="revealed = !revealed"
        />
    </IconField>
</template>

<style scoped>
.masked-text {
    -webkit-text-security: disc;
}
</style>
