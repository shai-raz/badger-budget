<script setup lang="ts">
import type { Category } from "@badger/types";

interface Props {
    /** Hide this category from the options (e.g. the one being deleted). */
    excludeId?: string;
    /** Keep this category visible even when it would otherwise be a hidden system category (e.g. the currently-selected one). */
    keepId?: string;
    loading?: boolean;
    placeholder?: string;
    /** Offer a synthetic "+ Create '<filter text>'" option; picking it sets `pendingName`. */
    creatable?: boolean;
    /** Swatch colour for the pending category in the value slot. */
    pendingColor?: string;
}

const props = withDefaults(defineProps<Props>(), {
    placeholder: "Select a category",
    excludeId: undefined,
    keepId: undefined,
    creatable: false,
    pendingColor: undefined,
});

const modelValue = defineModel<string | null>();
const pendingName = defineModel<string | null>("pendingName", { default: null });
const filterText = ref("");

const { options, isLoading } = useSelectableCategories(
    () => props.excludeId,
    () => props.keepId,
);

// All categories (including hidden system ones) for the exact-match check.
const { data: allCategories } = useGetCategoriesQuery();

const createName = computed(() =>
    props.creatable
        ? createOptionName(
              filterText.value,
              ((allCategories.value ?? []) as Category[]).map((c) => c.name),
          )
        : null,
);

// The synthetic option carries the raw filter text as its name so PrimeVue's "contains" filter always keeps it.
const selectOptions = computed(() =>
    createName.value
        ? [...options.value, { id: NEW_CATEGORY_OPTION_ID, name: filterText.value, color: "", isCreate: true }]
        : options.value,
);

const selectValue = computed<string | null | undefined>({
    get: () => (pendingName.value ? NEW_CATEGORY_OPTION_ID : modelValue.value),
    set: (v) => {
        if (v === NEW_CATEGORY_OPTION_ID) {
            if (createName.value) {
                pendingName.value = createName.value;
                modelValue.value = null;
            }
            return;
        }
        // Picking an existing category or clearing discards the pending one.
        pendingName.value = null;
        modelValue.value = v;
    },
});

const selectedCategory = computed(() => options.value.find((c) => c.id === modelValue.value));

const optionPt = {
    option: ({ context }: { context: { option?: { isCreate?: boolean } } }) => ({
        class: context.option?.isCreate ? "border-t border-surface-200 dark:border-surface-700" : "",
    }),
};
</script>

<template>
    <Select
        v-model="selectValue"
        :options="selectOptions"
        option-label="name"
        option-value="id"
        :placeholder="placeholder"
        class="w-full"
        :loading="loading || isLoading"
        filter
        reset-filter-on-hide
        auto-filter-focus
        :pt="optionPt"
        @filter="(e) => (filterText = e.value ?? '')"
        @hide="filterText = ''"
    >
        <template #value="slotProps">
            <div
                v-if="pendingName"
                class="flex items-center gap-2"
            >
                <div
                    class="w-4 h-4 rounded-full bg-surface-300 dark:bg-surface-600"
                    :style="pendingColor ? { backgroundColor: pendingColor } : undefined"
                ></div>
                <span>{{ pendingName }}</span>
                <Tag
                    value="New"
                    severity="secondary"
                    class="!text-xs"
                />
            </div>
            <div
                v-else-if="slotProps.value && selectedCategory"
                class="flex items-center gap-2"
            >
                <div
                    class="w-4 h-4 rounded-full"
                    :style="{ backgroundColor: selectedCategory.color }"
                ></div>
                <span>{{ selectedCategory.name }}</span>
            </div>
            <span v-else>{{ slotProps.placeholder }}</span>
        </template>
        <template #option="slotProps">
            <div
                v-if="slotProps.option.isCreate"
                class="flex items-center gap-2 font-medium"
            >
                <i
                    class="pi pi-plus"
                    aria-hidden="true"
                ></i>
                <span>Create '{{ createName }}'</span>
            </div>
            <div
                v-else
                class="flex items-center gap-2"
            >
                <div
                    class="w-4 h-4 rounded-full"
                    :style="{ backgroundColor: slotProps.option.color }"
                ></div>
                <span>{{ slotProps.option.name }}</span>
            </div>
        </template>
    </Select>
</template>
