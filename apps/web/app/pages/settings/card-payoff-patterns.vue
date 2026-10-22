<script setup lang="ts">
import {
    useGetCardPayoffPatterns,
    useDeleteCardPayoffPattern,
    useApplyAllCardPayoffPatterns,
    useApplyAllLinkPreviewLoader,
} from "../../composables/card-payoff-patterns/useCardPayoffPatterns";
import { linkRemovalWarning } from "../../utils/reimbursement";
import { useConfirm } from "primevue/useconfirm";
import type { ICardPayoffPattern } from "@badger/types";

// fullBleed: below md the band runs edge to edge, as on Overview (see layouts/app.vue).
definePageMeta({
    layout: "app",
    fullBleed: true,
});

const confirm = useConfirm();
const isDesktop = useIsDesktop();
const { data: patterns, isLoading, error } = useGetCardPayoffPatterns();
const { mutate: deletePattern, isPending: isDeleting } = useDeleteCardPayoffPattern();
const { mutate: applyAllPatterns, isPending: isApplying } = useApplyAllCardPayoffPatterns();
const loadApplyAllLinkPreview = useApplyAllLinkPreviewLoader();

const handleDelete = (pattern: ICardPayoffPattern) => {
    if (pattern.isSystem) {
        return; // Should not happen as button is disabled
    }

    confirm.require({
        message: `Are you sure you want to delete the pattern "${pattern.description}"?`,
        header: "Delete pattern",
        icon: "pi pi-exclamation-triangle",
        rejectLabel: "Cancel",
        acceptLabel: "Delete",
        accept: () => {
            deletePattern(pattern.id);
        },
    });
};

const handleApplyAll = async () => {
    const baseMessage =
        "This will apply all card payoff patterns to your existing transactions. Matching transactions will be marked as transfers and hidden from your transaction list.";
    let warning: string | null = null;
    try {
        warning = linkRemovalWarning(await loadApplyAllLinkPreview());
    } catch {
        // Preview is best-effort: fall back to the static message.
    }

    confirm.require({
        message: warning ? `${baseMessage}\n\n${warning}` : baseMessage,
        header: "Apply all patterns",
        icon: "pi pi-info-circle",
        rejectLabel: "Cancel",
        acceptLabel: "Apply",
        accept: () => {
            applyAllPatterns();
        },
    });
};

const getTypeLabel = (isSystem: boolean) => {
    return isSystem ? "System" : "User";
};

const getTypeSeverity = (isSystem: boolean): "info" | "success" => {
    return isSystem ? "info" : "success";
};
</script>

<template>
    <div class="flex flex-col gap-3 pb-8 md:gap-6">
        <LayoutPageHeader
            title="Card payoff patterns"
            back-to="/settings"
        >
            <template #actions>
                <LayoutHeaderButton
                    label="Apply all"
                    icon="pi pi-play"
                    :loading="isApplying"
                    :disabled="isLoading || !patterns || patterns.length === 0"
                    @click="handleApplyAll"
                />
            </template>
        </LayoutPageHeader>

        <SharedSectionBand
            title="Patterns"
            :loading="isLoading"
            :error="error"
            :empty="!patterns || patterns.length === 0"
        >
            <template #empty>
                <SharedEmptyState
                    title="No card payoff patterns configured yet."
                    text="Mark a transaction as a credit card payment from the transaction list to create a pattern."
                />
            </template>

            <p class="px-4 pb-3 text-sm text-surface-600 md:px-0 md:pb-4 dark:text-surface-300">
                Manage descriptions that identify transfers between your own accounts, such as credit card payments.
                Matching transactions are marked as transfers, hidden from your transaction list, and excluded from
                income and expense totals.
            </p>

            <DataTable
                v-if="isDesktop"
                :value="patterns"
                striped-rows
            >
                <Column
                    field="description"
                    header="Description"
                    sortable
                >
                    <template #body="{ data }: { data: ICardPayoffPattern }">
                        <div class="font-medium">{{ data.description }}</div>
                    </template>
                </Column>

                <Column
                    field="isSystem"
                    header="Type"
                    sortable
                    style="width: 10rem"
                >
                    <template #body="{ data }: { data: ICardPayoffPattern }">
                        <SharedStatusTag
                            :value="getTypeLabel(data.isSystem)"
                            :tone="getTypeSeverity(data.isSystem)"
                        />
                    </template>
                </Column>

                <Column
                    field="createdAt"
                    header="Created"
                    sortable
                    style="width: 12rem"
                >
                    <template #body="{ data }: { data: ICardPayoffPattern }">
                        {{ new Date(data.createdAt).toLocaleDateString() }}
                    </template>
                </Column>

                <Column
                    header="Actions"
                    style="width: 8rem"
                >
                    <template #body="{ data }: { data: ICardPayoffPattern }">
                        <Button
                            icon="pi pi-trash"
                            severity="danger"
                            text
                            rounded
                            :disabled="data.isSystem || isDeleting"
                            :title="data.isSystem ? 'System patterns cannot be deleted' : 'Delete pattern'"
                            @click="handleDelete(data)"
                        />
                    </template>
                </Column>
            </DataTable>

            <div
                v-else
                class="divide-y divide-surface-200 dark:divide-surface-700"
            >
                <div
                    v-for="pattern in patterns"
                    :key="pattern.id"
                    class="flex items-center gap-3 px-4 py-3"
                >
                    <div class="flex min-w-0 flex-1 flex-col gap-1">
                        <span class="truncate font-medium">{{ pattern.description }}</span>
                        <div class="flex items-center gap-2 text-xs text-surface-500 dark:text-surface-400">
                            <span>Created {{ new Date(pattern.createdAt).toLocaleDateString() }}</span>
                            <SharedStatusTag
                                :value="getTypeLabel(pattern.isSystem)"
                                :tone="getTypeSeverity(pattern.isSystem)"
                            />
                        </div>
                    </div>
                    <Button
                        icon="pi pi-trash"
                        severity="danger"
                        text
                        rounded
                        size="small"
                        class="shrink-0"
                        :disabled="pattern.isSystem || isDeleting"
                        :title="pattern.isSystem ? 'System patterns cannot be deleted' : 'Delete pattern'"
                        @click="handleDelete(pattern)"
                    />
                </div>
            </div>

            <div
                v-if="patterns && patterns.length > 0"
                class="mx-4 mt-3 mb-4 rounded-lg bg-surface-50 p-3 md:mx-0 md:mb-0 dark:bg-surface-800"
            >
                <div class="flex items-start gap-2">
                    <i class="pi pi-info-circle mt-1 text-blue-500"></i>
                    <div class="text-sm text-surface-700 dark:text-surface-200">
                        <strong>System patterns</strong> are provided by default and cannot be deleted.
                        <strong>User patterns</strong> are created when you mark transactions as credit card payments.
                        <br />
                        <strong>Apply all</strong> updates every existing transaction that matches any pattern. Use this
                        after adding new patterns or to retroactively apply system patterns to old transactions.
                    </div>
                </div>
            </div>
        </SharedSectionBand>
    </div>
</template>
