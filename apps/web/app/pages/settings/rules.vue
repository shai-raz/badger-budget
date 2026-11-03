<script setup lang="ts">
import type { Category, IRule } from "@badger/types";
import type { MenuItem } from "primevue/menuitem";
import { useConfirm } from "primevue/useconfirm";
import { useToast } from "primevue/usetoast";
import { getApiErrorMessage } from "~/utils/apiError";
import type { RuleDisplayContext } from "~/utils/ruleSentence";
import ApplyRuleDialog from "../../components/rules/ApplyRuleDialog.vue";
import RulesList from "../../components/rules/RulesList.vue";

// fullBleed: below md the band runs edge to edge, as on Overview (see layouts/app.vue).
definePageMeta({
    layout: "app",
    fullBleed: true,
});

const confirm = useConfirm();
const toast = useToast();
const { openCreate, openEdit } = useRuleEditorDialog();
const { data: rules, isLoading, error } = useRulesQuery();
const { data: accounts, isLoading: accountsLoading } = useGetAccounts();
const { data: categories, isLoading: categoriesLoading } = useGetCategoriesQuery();
const { mutate: setActive } = useSetRuleActiveMutation();
const { mutate: deleteRule } = useDeleteRuleMutation();

const menu = ref();
const selectedRule = ref<IRule | null>(null);
const reorderMode = ref(false);
// The one Apply dialog, pointed at a rule from the row menu. The rule stays set while the dialog closes.
const applyOpen = ref(false);
const applyRule = ref<IRule | null>(null);
const openApply = (rule: IRule) => {
    applyRule.value = rule;
    applyOpen.value = true;
};

// Names for the account and category ids a rule refers to, so the sentence and search read as text.
const displayContext = computed<RuleDisplayContext>(() => ({
    accountName: (id) => accounts.value?.find((account) => account.id === id)?.name,
    category: (id) => {
        const category = categories.value?.find((item: Category) => item.id === id);
        return category ? { name: category.name, color: category.color, icon: category.icon } : undefined;
    },
}));

const isBandLoading = computed(() => isLoading.value || accountsLoading.value || categoriesLoading.value);

const menuItems = computed<MenuItem[]>(() => {
    const rule = selectedRule.value;
    if (!rule) return [];
    return [
        {
            label: "Edit",
            icon: "pi pi-pencil",
            command: () => openEdit(rule),
        },
        {
            label: "Apply now…",
            icon: "pi pi-play",
            command: () => openApply(rule),
        },
        { separator: true },
        {
            label: "Delete",
            icon: "pi pi-trash",
            class: "text-red-500",
            command: () => confirmDelete(rule),
        },
    ];
});

// Mobile rows share one ⋮ menu, pointed at the row it was opened from.
const openMenu = (event: Event, rule: IRule) => {
    selectedRule.value = rule;
    menu.value?.toggle(event);
};

const handleToggle = (rule: IRule, isActive: boolean) => {
    setActive(
        { id: rule.id, isActive },
        {
            onError: (err) => {
                toast.add({
                    severity: "error",
                    summary: "Error",
                    detail: getApiErrorMessage(err, "Couldn't update the rule."),
                    life: 5000,
                });
            },
        },
    );
};

const confirmDelete = (rule: IRule) => {
    confirm.require({
        header: `Delete "${rule.name}"?`,
        message: "It stops running on new transactions. Transactions it already categorized keep their category.",
        icon: "pi pi-exclamation-triangle",
        rejectProps: { label: "Cancel", severity: "secondary", text: true },
        acceptProps: { label: "Delete rule", severity: "danger" },
        accept: () => {
            deleteRule(rule.id, {
                onSuccess: () => {
                    toast.add({ severity: "success", summary: "Rule deleted", life: 3000 });
                },
                onError: (err) => {
                    toast.add({
                        severity: "error",
                        summary: "Error",
                        detail: getApiErrorMessage(err, "Couldn't delete the rule."),
                        life: 5000,
                    });
                },
            });
        },
    });
};
</script>

<template>
    <div class="flex flex-col gap-3 pb-8 md:gap-6">
        <LayoutPageHeader
            title="Rules"
            back-to="/settings"
        >
            <template #actions>
                <LayoutHeaderButton
                    v-if="!reorderMode"
                    label="New"
                    icon="pi pi-plus"
                    primary
                    aria-label="New rule"
                    @click="openCreate"
                />
            </template>
        </LayoutPageHeader>

        <RulesList
            v-model:reorder-mode="reorderMode"
            :rules="rules"
            :context="displayContext"
            :loading="isBandLoading"
            :error="error"
            @toggle="handleToggle"
            @actions="openMenu"
            @edit="openEdit"
            @create="openCreate"
        />

        <Menu
            ref="menu"
            :model="menuItems"
            popup
        />

        <ApplyRuleDialog
            :visible="applyOpen"
            :rule="applyRule"
            @update:visible="applyOpen = $event"
        />
    </div>
</template>
