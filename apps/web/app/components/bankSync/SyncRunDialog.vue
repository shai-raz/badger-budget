<script setup lang="ts">
import { useToast } from "primevue/usetoast";

import type { IScraperConnectionResponse, IScraperJob } from "@badger/types";
import { useSyncRunDialog } from "~/composables/bankSync/useSyncRunDialog";
import { useBankSyncFlow } from "~/composables/bankSync/useBankSyncFlow";
import { useSyncJobQuery, useScraperConnectionsQuery } from "~/composables/bankSync/useBankSync";
import { useConnectionEditor } from "~/composables/bankSync/useConnectionEditor";
import { providerName } from "~/utils/bankConnections";
import { SYNC_ERROR_ACTION_LABEL, syncErrorCopy } from "~/utils/syncErrors";
import type { SyncErrorAction } from "~/utils/syncErrors";
import { formatDuration, initialExpanded, runResult, runScope, runSyncedCount } from "~/utils/syncRuns";

// Mounted once in layouts/app.vue. Shows one run's per-connection results; failed rows expand to explain the error.
const { state, close } = useSyncRunDialog();
const toast = useToast();
const { busy, requestSync } = useBankSyncFlow();
const { openEdit } = useConnectionEditor();

const { data: run, isError } = useSyncJobQuery(computed(() => state.value.jobId));
const { data: connections } = useScraperConnectionsQuery();

const MIDDOT = " \u00b7 ";

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

const dateTimeFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" });
const title = computed(() => (run.value ? `Sync on ${dateTimeFormat.format(new Date(run.value.startedAt))}` : "Sync"));

const summary = computed(() => {
    const current = run.value;
    if (!current) return null;

    const { synced, total } = runSyncedCount(current);
    const parts = [
        runScope(current),
        `${synced} of ${total} synced`,
        plural(current.transactionsSynced, "new transaction"),
    ];
    const duration = formatDuration(current.startedAt, current.finishedAt);
    if (duration) parts.push(duration);

    return { tag: runResult(current.status), text: parts.join(MIDDOT) };
});

// Ids of the failed rows that are open. Recomputed when the dialog opens, the job or expanded connection changes, or
// the job's data first arrives (a dialog opened before its run loads still expands the right row).
const expanded = ref(new Set<string>());
const technicalOpen = ref(new Set<string>());
watch(
    [() => state.value.visible, () => state.value.jobId, () => state.value.expandConnectionId, () => run.value?.id],
    () => {
        expanded.value = run.value ? initialExpanded(run.value, state.value.expandConnectionId) : new Set();
        technicalOpen.value = new Set();
    },
);

// Templates unwrap refs, so these take the id and write the ref here rather than passing the ref in.
const withToggled = (set: ReadonlySet<string>, id: string): Set<string> => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
};
const toggleExpanded = (id: string) => {
    expanded.value = withToggled(expanded.value, id);
};
const toggleTechnical = (id: string) => {
    technicalOpen.value = withToggled(technicalOpen.value, id);
};

const connectionFor = (job: IScraperJob): IScraperConnectionResponse | undefined =>
    job.scraperConnectionId ? connections.value?.find((c) => c.id === job.scraperConnectionId) : undefined;

// Update login stays available on a paused connection. Retry is not, since a paused connection never syncs.
const actionFor = (job: IScraperJob): SyncErrorAction | null => {
    const connection = connectionFor(job);
    const action = syncErrorCopy(job.errorCode).action;
    if (!connection || !action) return null;
    if (action === "retry" && !connection.isActive) return null;
    return action;
};

const actionLabelFor = (job: IScraperJob): string | null => {
    const action = actionFor(job);
    return action ? SYNC_ERROR_ACTION_LABEL[action] : null;
};

// requestSync does nothing while a sync runs, so Retry is disabled then, as it is on the failure strip.
const actionDisabledFor = (job: IScraperJob): boolean => actionFor(job) === "retry" && busy.value;

const rowMeta = (job: IScraperJob): string => {
    if (job.status === "pending") return "Waiting";
    if (job.status === "running") return "Syncing\u2026";
    return plural(job.transactionsSynced, "transaction");
};

// Actions close the dialog first and run once it has hidden, so two dialogs never stack.
const afterHide = ref<(() => void) | null>(null);
const closeThen = (next: () => void) => {
    afterHide.value = next;
    close();
};
const onAfterHide = () => {
    // Stop polling the run once hidden. Only if still closed: open() can run during the hide animation.
    if (!state.value.visible) state.value = { ...state.value, jobId: null };
    const next = afterHide.value;
    afterHide.value = null;
    next?.();
};

const onAction = (job: IScraperJob) => {
    const connection = connectionFor(job);
    const action = actionFor(job);
    if (!connection || !action) return;
    if (action === "update-login") closeThen(() => openEdit(connection, { updateLogin: true }));
    else closeThen(() => requestSync({ connectionId: connection.id }));
};

const copyTechnical = async (text: string) => {
    try {
        await navigator.clipboard.writeText(text);
        toast.add({
            severity: "success",
            summary: "Copied",
            detail: "Technical details copied to clipboard",
            life: 2000,
        });
    } catch {
        toast.add({ severity: "error", summary: "Error", detail: "Could not copy to clipboard", life: 4000 });
    }
};

const onVisibleChange = (value: boolean) => {
    if (!value) close();
};
</script>

<template>
    <Dialog
        :visible="state.visible"
        modal
        :draggable="false"
        :header="title"
        :style="{ width: '35rem' }"
        @update:visible="onVisibleChange"
        @after-hide="onAfterHide"
    >
        <div
            v-if="run"
            class="flex flex-col gap-3"
        >
            <div
                v-if="summary"
                class="flex flex-wrap items-center gap-2 text-sm text-muted-color"
            >
                <SharedStatusTag
                    :value="summary.tag.label"
                    :tone="summary.tag.tone"
                />
                <span>{{ summary.text }}</span>
            </div>

            <ul class="flex flex-col divide-y divide-surface-200 dark:divide-surface-700">
                <li
                    v-for="job in run.scraperJobs"
                    :key="job.id"
                >
                    <template v-if="job.status === 'failed'">
                        <button
                            type="button"
                            class="flex w-full items-center gap-3 py-3 text-left"
                            :aria-expanded="expanded.has(job.id) ? 'true' : 'false'"
                            :aria-controls="`sync-run-job-${job.id}`"
                            @click="toggleExpanded(job.id)"
                        >
                            <i
                                class="pi pi-exclamation-circle shrink-0 text-[var(--p-sync-error-color)]"
                                aria-hidden="true"
                            />
                            <span class="min-w-0 flex-1">
                                <span class="block truncate text-sm font-semibold">{{ job.displayName }}</span>
                                <span class="block truncate text-xs text-muted-color">{{
                                    syncErrorCopy(job.errorCode).short
                                }}</span>
                            </span>
                            <i
                                class="pi pi-chevron-down shrink-0 text-muted-color transition-transform"
                                :class="{ 'rotate-180': expanded.has(job.id) }"
                                aria-hidden="true"
                            />
                        </button>

                        <div
                            v-if="expanded.has(job.id)"
                            :id="`sync-run-job-${job.id}`"
                            class="flex flex-col gap-3 pb-3 pl-7"
                        >
                            <p class="text-sm">{{ syncErrorCopy(job.errorCode).explain }}</p>

                            <div v-if="actionLabelFor(job)">
                                <Button
                                    :label="actionLabelFor(job) ?? undefined"
                                    :disabled="actionDisabledFor(job)"
                                    outlined
                                    size="small"
                                    @click="onAction(job)"
                                />
                            </div>

                            <div v-if="job.error">
                                <button
                                    type="button"
                                    class="text-sm text-primary hover:underline"
                                    :aria-expanded="technicalOpen.has(job.id) ? 'true' : 'false'"
                                    @click="toggleTechnical(job.id)"
                                >
                                    Technical details
                                </button>
                                <div
                                    v-if="technicalOpen.has(job.id)"
                                    class="relative mt-2"
                                >
                                    <pre
                                        class="whitespace-pre-wrap break-words rounded bg-surface-100 p-2 pr-10 text-xs dark:bg-surface-800"
                                        >{{ job.error }}</pre
                                    >
                                    <Button
                                        icon="pi pi-copy"
                                        severity="secondary"
                                        text
                                        size="small"
                                        class="absolute right-1 top-1"
                                        aria-label="Copy technical details"
                                        @click="copyTechnical(job.error)"
                                    />
                                </div>
                            </div>
                        </div>
                    </template>

                    <div
                        v-else
                        class="flex items-center gap-3 py-3"
                    >
                        <span class="min-w-0 flex-1">
                            <span class="block truncate text-sm font-semibold">{{ job.displayName }}</span>
                            <span class="block truncate text-xs text-muted-color">{{
                                providerName(job.companyId)
                            }}</span>
                        </span>
                        <span class="shrink-0 text-xs text-muted-color">{{ rowMeta(job) }}</span>
                    </div>
                </li>
            </ul>
        </div>
        <Message
            v-else-if="isError"
            severity="error"
            :closable="false"
            >Couldn't load this sync.</Message
        >
        <div
            v-else
            class="flex flex-col gap-3"
        >
            <Skeleton height="1.25rem" />
            <Skeleton height="3rem" />
        </div>

        <template #footer>
            <Button
                label="Close"
                severity="secondary"
                class="ml-auto"
                @click="close"
            />
        </template>
    </Dialog>
</template>
