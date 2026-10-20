<script setup lang="ts">
import type { Category } from "@badger/types";
import { useToast } from "primevue/usetoast";

const props = defineProps<{
    visible: boolean;
    category?: Category | null;
}>();

const emit = defineEmits<{
    "update:visible": [value: boolean];
    close: [];
}>();

const toast = useToast();
const createMutation = useCreateCategoryMutation();
const updateMutation = useUpdateCategoryMutation();

const categoryName = ref("");
const categoryColor = ref("#3B82F6");
const colorPickerRef = ref<{ isValidHexColor: () => boolean } | null>(null);
const saving = ref(false);
const apiError = ref<string | null>(null);

const isEditMode = computed(() => !!props.category);
const dialogTitle = computed(() => (isEditMode.value ? "Edit category" : "Add category"));

const canSave = computed(() => {
    return categoryName.value.trim().length > 0 && categoryColor.value.trim().length > 0;
});

const resetForm = () => {
    categoryName.value = "";
    categoryColor.value = "#3B82F6";
};

const loadCategory = () => {
    if (props.category) {
        categoryName.value = props.category.name;
        categoryColor.value = props.category.color;
    } else {
        resetForm();
    }
};

watch(
    () => props.visible,
    (newValue) => {
        if (newValue) {
            loadCategory();
        }
    },
);

const handleClose = () => {
    emit("update:visible", false);
    emit("close");
    apiError.value = null;
    resetForm();
};

const handleSave = async () => {
    // Validate hex color format
    if (colorPickerRef.value && !colorPickerRef.value.isValidHexColor()) {
        toast.add({
            severity: "error",
            summary: "Invalid Color",
            detail: "Please enter a valid hex color (e.g., #3B82F6)",
            life: 3000,
        });
        return;
    }

    saving.value = true;
    apiError.value = null;

    try {
        if (isEditMode.value && props.category) {
            await updateMutation.mutateAsync({
                id: props.category.id,
                data: {
                    name: categoryName.value.trim(),
                    color: categoryColor.value.trim(),
                },
            });
            toast.add({
                severity: "success",
                summary: "Success",
                detail: "Category updated successfully",
                life: 3000,
            });
        } else {
            await createMutation.mutateAsync({
                name: categoryName.value.trim(),
                color: categoryColor.value.trim(),
            });
            toast.add({
                severity: "success",
                summary: "Success",
                detail: "Category created successfully",
                life: 3000,
            });
        }
        handleClose();
    } catch (error) {
        apiError.value = getApiErrorMessage(error, `Failed to ${isEditMode.value ? "update" : "create"} category`);
    } finally {
        saving.value = false;
    }
};
</script>

<template>
    <SharedFormDialog
        :visible="visible"
        :header="dialogTitle"
        :busy="saving"
        :api-error="apiError"
        :initial-focus="isEditMode ? 'dialog' : 'field'"
        :save-disabled="!canSave"
        @update:visible="handleClose"
        @save="handleSave"
    >
        <div class="flex flex-col gap-4">
            <div>
                <label
                    for="category-name"
                    class="block text-sm font-medium mb-2"
                    >Category Name *</label
                >
                <InputText
                    id="category-name"
                    v-model="categoryName"
                    placeholder="Enter category name"
                    class="w-full"
                    :autofocus="!isEditMode"
                />
            </div>

            <div>
                <label
                    for="category-color"
                    class="block text-sm font-medium mb-2"
                    >Category Color *</label
                >
                <CategoriesColorPicker
                    ref="colorPickerRef"
                    v-model="categoryColor"
                />
            </div>
        </div>
    </SharedFormDialog>
</template>
