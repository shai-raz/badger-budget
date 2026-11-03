<script setup lang="ts">
import type { Category, IRule } from "@badger/types";
import type { MenuItem } from "primevue/menuitem";
import { useConfirm } from "primevue/useconfirm";
import { useToast } from "primevue/usetoast";
import { getApiErrorMessage } from "~/utils/apiError";
import { ruleMatchesSearch, type RuleDisplayContext } from "~/utils/ruleSentence";
import RuleRow from "../../components/rules/RuleRow.vue";

// fullBleed: below md the band runs edge to edge, as on Overview (see layouts/app.vue).
definePageMeta({
    layout: "app",
    fullBleed: true,
});

const confirm = useConfirm();
const toast = useToast();
const { data: rules, isLoading, error } = useRulesQuery();
const { data: accounts, isLoading: accountsLoading } = useGetAccounts();
const { data: categories, isLoading: categoriesLoading } = useGetCategoriesQuery();
const { mutate: setActive } = useSetRuleActiveMutation();
const { mutate: deleteRule } = useDeleteRuleMutation();

const query = ref("");
const menu = ref();
const selectedRule = ref<IRule | null>(null);

// Names for the account and category ids a rule refers to, so the sentence and search read as text.
const displayContext = computed<RuleDisplayContext>(() => ({
    accountName: (id) => accounts.value?.find((account) => account.id === id)?.name,
    category: (id) => {
        const category = categories.value?.find((item: Category) => item.id === id);
        return category ? { name: category.name, color: category.color, icon: category.icon } : undefined;
    },
}));

const visibleRules = computed(() =>
    (rules.value ?? []).filter((rule) => ruleMatchesSearch(rule, query.value, displayContext.value)),
);
const trimmedQuery = computed(() => query.value.trim());
const isBandLoading = computed(() => isLoading.value || accountsLoading.value || categoriesLoading.value);
const meta = computed(() => {
    if (!rules.value) return undefined;
    const count = rules.value.length;
    return `${count} ${count === 1 ? "rule" : "rules"}`;
});

const menuItems = computed<MenuItem[]>(() => {
    const rule = selectedRule.value;
    if (!rule) return [];
    return [
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
        rejectLabel: "Cancel",
        acceptLabel: "Delete rule",
        acceptClass: "p-button-danger",
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
        />

        <SharedSectionBand
            title="Your rules"
            :meta="meta"
            :loading="isBandLoading"
            :error="error"
            :empty="!!rules && rules.length === 0"
        >
            <template #label>
                <span class="inline-flex items-center gap-1.5">
                    Your rules
                    <SharedHintButton
                        icon="pi-info-circle"
                        aria-label="How rules run"
                        tooltip="Rules run top to bottom on each new synced transaction."
                    />
                </span>
            </template>

            <template #empty>
                <SharedEmptyState
                    icon="pi-bolt"
                    title="No rules yet"
                    text="Rules set a category on new transactions for you. Create one here, or from a transaction's ⋮ menu."
                />
            </template>

            <div class="px-4 pb-3 md:px-0 md:pb-3">
                <IconField class="w-full md:max-w-[360px]">
                    <InputIcon class="pi pi-search" />
                    <InputText
                        v-model="query"
                        placeholder="Search rules"
                        aria-label="Search rules"
                        class="w-full"
                    />
                </IconField>
            </div>

            <p
                v-if="visibleRules.length === 0"
                class="px-4 pb-4 text-sm text-muted-color md:px-0"
            >
                No rules match "{{ trimmedQuery }}".
            </p>

            <div
                v-else
                class="divide-y divide-surface-200 dark:divide-surface-700"
            >
                <RuleRow
                    v-for="rule in visibleRules"
                    :key="rule.id"
                    :rule="rule"
                    :context="displayContext"
                    @toggle="(isActive) => handleToggle(rule, isActive)"
                    @actions="(event) => openMenu(event, rule)"
                />
            </div>
        </SharedSectionBand>

        <Menu
            ref="menu"
            :model="menuItems"
            popup
        />
    </div>
</template>
