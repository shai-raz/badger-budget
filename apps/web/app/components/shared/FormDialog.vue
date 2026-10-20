<script setup lang="ts">
/**
 * The shell for every form dialog: a modal `Dialog` with an optional error banner above
 * the form, and Cancel / Save buttons pinned in the footer. The caller supplies the form
 * as the default slot and decides where focus starts with `initialFocus`.
 *
 * Focus: PrimeVue's `Dialog.focus()` moves focus to the first `[autofocus]` inside the
 * content, or else to the close button (which then shows a focus ring).
 * - `field`: the form marks its first input `autofocus`, so typing starts at once.
 * - `dialog`: the body wrapper gets `tabindex="-1" autofocus`, so focus lands on the
 *   dialog itself. No keyboard opens and the ✕ has no ring, and Tab still reaches the
 *   first field. Use it for edit forms, where the values are already on screen.
 */
interface Props {
    visible: boolean;
    header: string;
    /** Disables the close controls and the form actions while a request is in flight. */
    busy?: boolean;
    apiError?: string | null;
    initialFocus: "field" | "dialog";
    saveLabel?: string;
    cancelLabel?: string;
    showSave?: boolean;
    saveDisabled?: boolean;
    /** Defaults to `busy`. */
    saveLoading?: boolean;
    width?: string;
}

const props = withDefaults(defineProps<Props>(), {
    busy: false,
    apiError: null,
    saveLabel: "Save",
    cancelLabel: "Cancel",
    showSave: true,
    saveDisabled: false,
    saveLoading: undefined,
    width: "36rem",
});

const emit = defineEmits<{
    "update:visible": [value: boolean];
    save: [];
    hide: [];
}>();

const bodyFocus = computed(() => (props.initialFocus === "dialog" ? { tabindex: -1, autofocus: true } : {}));
const isSaving = computed(() => props.saveLoading ?? props.busy);
</script>

<template>
    <Dialog
        :visible="visible"
        :header="header"
        modal
        :draggable="false"
        :style="{ width }"
        :closable="!busy"
        :close-on-escape="!busy"
        @update:visible="emit('update:visible', $event)"
        @hide="emit('hide')"
    >
        <div
            class="flex flex-col gap-4 outline-none"
            v-bind="bodyFocus"
        >
            <Message
                v-if="apiError"
                severity="error"
                :closable="false"
                >{{ apiError }}</Message
            >
            <slot />
        </div>

        <template #footer>
            <div class="flex w-full justify-end gap-2">
                <Button
                    :label="cancelLabel"
                    text
                    severity="secondary"
                    :disabled="busy"
                    @click="emit('update:visible', false)"
                />
                <Button
                    v-if="showSave"
                    :label="saveLabel"
                    icon="pi pi-check"
                    class="max-md:flex-1"
                    :loading="isSaving"
                    :disabled="busy || saveDisabled"
                    @click="emit('save')"
                />
            </div>
        </template>
    </Dialog>
</template>
