<script setup lang="ts">
import type { Category } from "@badger/types";
import { useToast } from "primevue/usetoast";
import type { DeleteCategoryVariables } from "~/composables/categories/useDeleteCategory.mutation";

interface Props {
    visible: boolean;
    category: Category | null;
}

const props = defineProps<Props>();
const emit = defineEmits<{ "update:visible": [value: boolean] }>();

const toast = useToast();
const deleteMutation = useDeleteCategoryMutation();
const { options: availableTargets } = useSelectableCategories(() => props.category?.id);

const {
    data: usage,
    isLoading: loadingUsage,
    isError: usageError,
} = useGetCategoryUsageQuery(
    () => props.category?.id,
    () => props.visible,
);

const deleting = ref(false);
const mode = ref<"leave" | "move">("leave");
const targetCategoryId = ref<string | null>(null);
const moveMappingRules = ref(true);

const mappingRuleCount = computed(() => usage.value?.mappingRuleCount ?? 0);
const hasUsage = computed(() => {
    const u = usage.value;
    if (!u) return false;
    return u.transactionCount + u.budgetCount + u.mappingRuleCount > 0;
});

const hasOtherCategories = computed(() => availableTargets.value.length > 0);

const isMoving = computed(() => mode.value === "move" && !!targetCategoryId.value);

const usageSummary = computed(() => {
    const u = usage.value;
    if (!u) return "";
    const parts: string[] = [];
    if (u.transactionCount > 0) parts.push(`${u.transactionCount} transaction${u.transactionCount > 1 ? "s" : ""}`);
    if (u.budgetCount > 0) parts.push(`${u.budgetCount} budget${u.budgetCount > 1 ? "s" : ""}`);
    if (u.mappingRuleCount > 0)
        parts.push(`${u.mappingRuleCount} auto-categorization rule${u.mappingRuleCount > 1 ? "s" : ""}`);
    return parts.join(", ");
});

const confirmLabel = computed(() => (isMoving.value ? "Delete & Move" : "Delete"));
const confirmDisabled = computed(() => {
    if (loadingUsage.value || deleting.value) return true;
    if (mode.value === "move" && !targetCategoryId.value) return true;
    return false;
});

const resetState = () => {
    mode.value = "leave";
    targetCategoryId.value = null;
    moveMappingRules.value = true;
};

watch(
    () => props.visible,
    (visible) => {
        if (visible) resetState();
    },
);

// Surface usage-fetch failures once per failure, without spamming on re-renders.
watch(usageError, (isError) => {
    if (isError) {
        toast.add({
            severity: "error",
            summary: "Error",
            detail: "Failed to fetch category usage information",
            life: 5000,
        });
    }
});

// If the only move targets disappear (e.g. visibility toggled), fall back to leave.
watch(hasOtherCategories, (has) => {
    if (!has && mode.value === "move") {
        mode.value = "leave";
        targetCategoryId.value = null;
    }
});

const handleClose = () => emit("update:visible", false);

const handleConfirm = async () => {
    if (!props.category) return;
    const payload: DeleteCategoryVariables = { id: props.category.id };
    if (mode.value === "move" && targetCategoryId.value) {
        payload.transferToCategoryId = targetCategoryId.value;
        if (mappingRuleCount.value > 0) payload.moveMappingRules = moveMappingRules.value;
    }
    deleting.value = true;
    try {
        await deleteMutation.mutateAsync(payload);
        toast.add({ severity: "success", summary: "Success", detail: "Category deleted successfully", life: 3000 });
        handleClose();
    } catch (error) {
        toast.add({
            severity: "error",
            summary: "Error",
            detail: getApiErrorMessage(error, "Failed to delete category"),
            life: 5000,
        });
    } finally {
        deleting.value = false;
    }
};
</script>

<template>
    <Dialog
        :visible="visible"
        class="dialog-compact max-w-[95vw]"
        modal
        header="Delete category"
        :style="{ width: '32rem' }"
        @update:visible="emit('update:visible', $event)"
    >
        <div
            v-if="category"
            class="flex flex-col gap-4"
        >
            <div class="flex items-center gap-2">
                <i class="pi pi-exclamation-triangle text-yellow-500 text-xl"></i>
                <span>Delete</span>
                <span class="flex items-center gap-2 font-semibold">
                    <span
                        class="w-4 h-4 rounded-full"
                        :style="{ backgroundColor: category.color }"
                    ></span>
                    {{ category.name }}
                </span>
                <span>?</span>
            </div>

            <div
                v-if="loadingUsage"
                class="text-muted-color text-sm"
            >
                Checking what uses this category…
            </div>

            <template v-else>
                <p
                    v-if="!hasUsage"
                    class="text-muted-color text-sm"
                >
                    Nothing is using this category, so there's nothing to move.
                </p>

                <template v-else>
                    <p class="text-sm">This category is used by {{ usageSummary }}. Choose what happens to them:</p>

                    <div class="flex flex-col gap-3">
                        <div class="flex items-start gap-2">
                            <RadioButton
                                v-model="mode"
                                input-id="delete-mode-leave"
                                value="leave"
                            />
                            <label
                                for="delete-mode-leave"
                                class="cursor-pointer"
                            >
                                <div>Leave them uncategorized</div>
                                <div class="text-muted-color text-xs">
                                    Transactions and budgets stay, but lose their category.
                                </div>
                            </label>
                        </div>

                        <div class="flex items-start gap-2">
                            <RadioButton
                                v-model="mode"
                                input-id="delete-mode-move"
                                value="move"
                                :disabled="!hasOtherCategories"
                            />
                            <label
                                for="delete-mode-move"
                                class="cursor-pointer"
                                :class="{ 'opacity-50': !hasOtherCategories }"
                            >
                                <div>Move them to another category</div>
                                <div class="text-muted-color text-xs">Re-assign everything to a category you pick.</div>
                            </label>
                        </div>

                        <Message
                            v-if="!hasOtherCategories"
                            severity="warn"
                            :closable="false"
                        >
                            There are no other categories to move these to. Create one first, or leave them
                            uncategorized.
                        </Message>

                        <div
                            v-if="mode === 'move'"
                            class="ml-6 flex flex-col gap-3"
                        >
                            <CategoriesCategorySelect
                                v-model="targetCategoryId"
                                :exclude-id="category.id"
                            />

                            <div
                                v-if="mappingRuleCount > 0"
                                class="flex items-center gap-2"
                            >
                                <Checkbox
                                    v-model="moveMappingRules"
                                    input-id="move-mapping-rules"
                                    :binary="true"
                                />
                                <label
                                    for="move-mapping-rules"
                                    class="cursor-pointer text-sm"
                                >
                                    Also move {{ mappingRuleCount }} auto-categorization rule{{
                                        mappingRuleCount > 1 ? "s" : ""
                                    }}
                                    to the new category
                                </label>
                            </div>
                        </div>

                        <p
                            v-if="mode === 'leave' && mappingRuleCount > 0"
                            class="text-muted-color text-xs"
                        >
                            {{ mappingRuleCount }} auto-categorization rule{{ mappingRuleCount > 1 ? "s" : "" }} will be
                            deleted, since they can't work without a category.
                        </p>
                    </div>
                </template>
            </template>
        </div>

        <template #footer>
            <Button
                label="Cancel"
                text
                :disabled="deleting"
                @click="handleClose"
            />
            <Button
                :label="confirmLabel"
                severity="danger"
                icon="pi pi-trash"
                :disabled="confirmDisabled"
                :loading="deleting"
                @click="handleConfirm"
            />
        </template>
    </Dialog>
</template>
