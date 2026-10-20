<script setup lang="ts">
import type { Category } from "@badger/types";
import type { MenuItem } from "primevue/menuitem";

// fullBleed: below md the band runs edge to edge, as on Overview (see layouts/app.vue).
definePageMeta({
    layout: "app",
    fullBleed: true,
});

const { hideSystemCategories, toggleSystemCategories } = useSystemCategoryVisibility();

const overflowItems = computed<MenuItem[]>(() => [
    {
        label: hideSystemCategories.value ? "Show system categories" : "Hide system categories",
        icon: hideSystemCategories.value ? "pi pi-eye" : "pi pi-eye-slash",
        command: toggleSystemCategories,
    },
]);

const { data: categories, isLoading } = useGetCategoriesQuery();
const showFormModal = ref(false);
const editingCategory = ref<Category | null>(null);
const showDeleteDialog = ref(false);
const categoryToDelete = ref<Category | null>(null);

const handleAddCategory = () => {
    editingCategory.value = null;
    showFormModal.value = true;
};

const handleEditCategory = (category: Category) => {
    editingCategory.value = category;
    showFormModal.value = true;
};

const handleDeleteCategory = (category: Category) => {
    categoryToDelete.value = category;
    showDeleteDialog.value = true;
};

const handleFormClose = () => {
    showFormModal.value = false;
    editingCategory.value = null;
};
</script>

<template>
    <div class="flex flex-col gap-3 pb-8 md:gap-6">
        <LayoutPageHeader
            title="Categories"
            :overflow-items="overflowItems"
        >
            <template #actions>
                <LayoutHeaderButton
                    label="New"
                    icon="pi pi-plus"
                    primary
                    aria-label="New category"
                    @click="handleAddCategory"
                />
            </template>
        </LayoutPageHeader>

        <SharedSectionBand
            title="Categories"
            :meta="`${categories?.length ?? 0}`"
            :loading="isLoading"
        >
            <CategoriesList
                :categories="categories || []"
                @edit="handleEditCategory"
                @delete="handleDeleteCategory"
            />
        </SharedSectionBand>

        <CategoriesFormModal
            v-model:visible="showFormModal"
            :category="editingCategory"
            @close="handleFormClose"
        />

        <CategoriesDeleteCategoryDialog
            v-model:visible="showDeleteDialog"
            :category="categoryToDelete"
        />
    </div>
</template>
