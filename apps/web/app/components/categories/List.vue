<script setup lang="ts">
import type { Category } from "@badger/types";
import { DEFAULT_CATEGORY_AVATAR_ICON } from "@badger/shared-data";

defineProps<{
    categories: Category[];
}>();

const emit = defineEmits<{
    edit: [category: Category];
    delete: [category: Category];
}>();

const isDesktop = useIsDesktop();

const handleEdit = (category: Category) => {
    emit("edit", category);
};

const handleDelete = (category: Category) => {
    emit("delete", category);
};

// Mobile rows share one ⋮ menu, pointed at the row it was opened from.
const menu = ref();
const selectedCategory = ref<Category | null>(null);

// Only custom categories reach the menu: the ⋮ button is not rendered for system rows.
const menuItems = computed(() => {
    const category = selectedCategory.value;
    if (!category) return [];
    return [
        {
            label: "Edit",
            icon: "pi pi-pencil",
            command: () => handleEdit(category),
        },
        {
            label: "Delete",
            icon: "pi pi-trash",
            command: () => handleDelete(category),
        },
    ];
});

const openMenu = (event: Event, category: Category) => {
    selectedCategory.value = category;
    menu.value?.toggle(event);
};
</script>

<template>
    <DataTable
        v-if="isDesktop"
        :value="categories"
        striped-rows
    >
        <template #empty>
            <SharedEmptyState text="No categories available. System categories should appear here automatically." />
        </template>

        <Column
            header="Icon"
            style="width: 64px"
        >
            <template #body="{ data }">
                <SharedEntityAvatar
                    :icon="data.icon"
                    :color="data.color"
                    :fallback="DEFAULT_CATEGORY_AVATAR_ICON"
                />
            </template>
        </Column>

        <Column
            field="name"
            header="Name"
            sortable
        ></Column>

        <Column
            header="Type"
            style="width: 120px"
        >
            <template #body="{ data }">
                <SharedStatusTag
                    v-if="data.isSystem"
                    value="System"
                    tone="info"
                />
                <SharedStatusTag
                    v-else
                    value="Custom"
                />
            </template>
        </Column>

        <Column
            header="Actions"
            style="width: 120px"
        >
            <template #body="{ data }">
                <div class="flex gap-2">
                    <Button
                        v-tooltip.top="data.isSystem ? 'System categories cannot be edited' : 'Edit category'"
                        icon="pi pi-pencil"
                        text
                        rounded
                        :disabled="data.isSystem"
                        @click="handleEdit(data)"
                    />
                    <Button
                        v-tooltip.top="data.isSystem ? 'System categories cannot be deleted' : 'Delete category'"
                        icon="pi pi-trash"
                        severity="danger"
                        text
                        rounded
                        :disabled="data.isSystem"
                        @click="handleDelete(data)"
                    />
                </div>
            </template>
        </Column>
    </DataTable>

    <div
        v-else-if="categories.length > 0"
        class="divide-y divide-surface-200 dark:divide-surface-700"
    >
        <div
            v-for="category in categories"
            :key="category.id"
            class="flex items-center gap-3 px-4 py-3"
        >
            <SharedEntityAvatar
                :icon="category.icon"
                :color="category.color"
                :fallback="DEFAULT_CATEGORY_AVATAR_ICON"
            />
            <span class="min-w-0 flex-1 truncate font-semibold">{{ category.name }}</span>
            <SharedStatusTag
                v-if="category.isSystem"
                value="System"
                tone="info"
                class="shrink-0"
            />
            <SharedStatusTag
                v-else
                value="Custom"
                class="shrink-0"
            />
            <Button
                v-if="!category.isSystem"
                icon="pi pi-ellipsis-v"
                text
                rounded
                size="small"
                aria-label="Category actions"
                class="shrink-0 text-muted-color"
                @click="(event) => openMenu(event, category)"
            />
        </div>
    </div>

    <SharedEmptyState
        v-else
        text="No categories available. System categories should appear here automatically."
    />

    <Menu
        ref="menu"
        :model="menuItems"
        popup
    >
    </Menu>
</template>
