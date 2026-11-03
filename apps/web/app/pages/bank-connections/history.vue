<script setup lang="ts">
import type { ISyncJob } from "@badger/types";
import type { DataTableRowClickEvent } from "primevue/datatable";
import { useSyncHistoryQuery } from "~/composables/bankSync/useBankSync";
import { useSyncRunDialog } from "~/composables/bankSync/useSyncRunDialog";
import { runProblemSummary, runResult, runScope } from "~/utils/syncRuns";

// fullBleed: below md the band runs edge to edge, as on Overview (see layouts/app.vue).
definePageMeta({
    layout: "app",
    fullBleed: true,
});

const isDesktop = useIsDesktop();
const { data, isLoading, error, hasNextPage, isFetchingNextPage, fetchNextPage } = useSyncHistoryQuery();
const { open } = useSyncRunDialog();

const runs = computed<ISyncJob[]>(() => data.value?.pages.flatMap((page) => page.items) ?? []);

const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });
const timeFormat = new Intl.DateTimeFormat("en-US", { timeStyle: "short" });
const startedDate = (run: ISyncJob) => dateFormat.format(new Date(run.startedAt));
const startedTime = (run: ISyncJob) => timeFormat.format(new Date(run.startedAt));

const openRun = (id: string) => open(id);
const rowClass = () => "cursor-pointer";
const onRowClick = (event: DataTableRowClickEvent<ISyncJob>) => openRun(event.data.id);

// Mobile meta line: the scope, the problem when there is one, then the new-transaction count.
const mobileMeta = (run: ISyncJob) => {
    const parts = [runScope(run), runProblemSummary(run), `${run.transactionsSynced} new`];
    return parts.filter((part): part is string => part !== null).join(" \u00b7 ");
};
</script>

<template>
    <div class="flex flex-col gap-3 pb-8 md:gap-6">
        <LayoutPageHeader
            title="Sync history"
            back-to="/bank-connections"
        >
            <template #actions>
                <LayoutHeaderSync />
            </template>
        </LayoutPageHeader>

        <SharedSectionBand
            title="Syncs"
            :loading="isLoading"
            :error="error"
            :empty="runs.length === 0"
            empty-text="No syncs yet"
        >
            <DataTable
                v-if="isDesktop"
                :value="runs"
                data-key="id"
                :row-class="rowClass"
                @row-click="onRowClick"
            >
                <Column
                    header="Started"
                    style="width: 12rem"
                >
                    <template #body="{ data: run }: { data: ISyncJob }">
                        <button
                            type="button"
                            class="-mx-1 rounded px-1 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                            @click="openRun(run.id)"
                        >
                            <span class="block font-medium">{{ startedDate(run) }}</span>
                            <span class="block text-xs text-muted-color">{{ startedTime(run) }}</span>
                        </button>
                    </template>
                </Column>

                <Column
                    header="Connections"
                    style="width: 14rem"
                >
                    <template #body="{ data: run }: { data: ISyncJob }">
                        <span class="block truncate">{{ runScope(run) }}</span>
                    </template>
                </Column>

                <Column
                    header="Result"
                    style="width: 9rem"
                >
                    <template #body="{ data: run }: { data: ISyncJob }">
                        <SharedStatusTag
                            :value="runResult(run.status).label"
                            :tone="runResult(run.status).tone"
                        />
                    </template>
                </Column>

                <Column header="Problem">
                    <template #body="{ data: run }: { data: ISyncJob }">
                        <span class="block truncate">{{ runProblemSummary(run) ?? "\u2014" }}</span>
                    </template>
                </Column>

                <Column
                    header="New transactions"
                    header-class="text-right"
                    body-class="text-right"
                    style="width: 10rem"
                >
                    <template #body="{ data: run }: { data: ISyncJob }">
                        <span class="font-semibold tabular-nums">{{ run.transactionsSynced }}</span>
                    </template>
                </Column>

                <Column style="width: 3rem">
                    <template #body>
                        <i
                            class="pi pi-chevron-right text-muted-color"
                            aria-hidden="true"
                        />
                    </template>
                </Column>
            </DataTable>

            <ul
                v-else
                class="divide-y divide-surface-200 dark:divide-surface-700"
            >
                <li
                    v-for="run in runs"
                    :key="run.id"
                >
                    <button
                        type="button"
                        class="flex w-full items-center gap-3 px-4 py-3 text-left"
                        @click="openRun(run.id)"
                    >
                        <span class="flex min-w-0 flex-1 flex-col gap-1">
                            <span class="flex min-w-0 items-center gap-2">
                                <span class="truncate font-medium">
                                    {{ startedDate(run) }}, {{ startedTime(run) }}
                                </span>
                                <SharedStatusTag
                                    class="shrink-0"
                                    :value="runResult(run.status).label"
                                    :tone="runResult(run.status).tone"
                                />
                            </span>
                            <span class="truncate text-xs text-muted-color">{{ mobileMeta(run) }}</span>
                        </span>
                        <i
                            class="pi pi-chevron-right shrink-0 text-muted-color"
                            aria-hidden="true"
                        />
                    </button>
                </li>
            </ul>

            <div
                v-if="hasNextPage"
                class="px-4 py-3 md:px-0 md:pt-4"
            >
                <Button
                    label="Show older syncs"
                    severity="secondary"
                    text
                    class="w-full md:w-auto"
                    :loading="isFetchingNextPage"
                    @click="fetchNextPage()"
                />
            </div>
        </SharedSectionBand>
    </div>
</template>
