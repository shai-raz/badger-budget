<script setup lang="ts">
import type { Category } from "@badger/types";
import {
    DEFAULT_CATEGORY_AVATAR_ICON,
    defaultCategoryIcon,
    isAvatarIconName,
    type AvatarIconName,
} from "@badger/shared-data";
import { useToast } from "primevue/usetoast";
import { iconPatch } from "~/utils/iconPicker";

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
const categoryIcon = ref<AvatarIconName | null>(DEFAULT_CATEGORY_AVATAR_ICON);
// Once the user picks an icon, renaming no longer changes it.
const iconTouched = ref(false);
// Remounts the colour picker on each open so a Custom row left open does not carry over.
const colorPickerKey = ref(0);
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
    categoryIcon.value = DEFAULT_CATEGORY_AVATAR_ICON;
    iconTouched.value = false;
};

const loadCategory = () => {
    iconTouched.value = false;
    colorPickerKey.value++;
    if (props.category) {
        categoryName.value = props.category.name;
        categoryColor.value = props.category.color;
        categoryIcon.value = isAvatarIconName(props.category.icon) ? props.category.icon : DEFAULT_CATEGORY_AVATAR_ICON;
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

// Add mode: the icon follows the name until the user picks one.
watch(categoryName, (name) => {
    if (!isEditMode.value && !iconTouched.value) {
        categoryIcon.value = defaultCategoryIcon(name);
    }
});

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
                    ...iconPatch(props.category.icon, categoryIcon.value, iconTouched.value),
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
                icon: categoryIcon.value,
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
                    >Category name *</label
                >
                <div class="flex items-center gap-3">
                    <SharedIconPicker
                        v-model="categoryIcon"
                        :color="categoryColor"
                        fallback="tag"
                        aria-label="Category icon"
                        @update:model-value="iconTouched = true"
                    />
                    <InputText
                        id="category-name"
                        v-model="categoryName"
                        placeholder="Enter category name"
                        class="min-w-0 flex-1"
                        :autofocus="!isEditMode"
                    />
                </div>
            </div>

            <div>
                <span
                    id="category-color-label"
                    class="block text-sm font-medium mb-2"
                    >Category color *</span
                >
                <CategoriesColorPicker
                    :key="colorPickerKey"
                    ref="colorPickerRef"
                    v-model="categoryColor"
                    role="group"
                    aria-labelledby="category-color-label"
                />
            </div>
        </div>
    </SharedFormDialog>
</template>
