<script setup lang="ts">
import type { IScraperConnectionResponse } from "@badger/types";
import { useBankSyncFlow } from "~/composables/bankSync/useBankSyncFlow";
import { useConnectionEditor } from "~/composables/bankSync/useConnectionEditor";
import { useSyncRunDialog } from "~/composables/bankSync/useSyncRunDialog";
import { SYNC_ERROR_ACTION_LABEL } from "~/utils/syncErrors";
import { failureStripFor } from "~/utils/syncRuns";

// Shown under an active connection whose latest run failed. The whole strip opens the run's details dialog; the
// action button sits beside it, not inside it, so the two never nest.
const props = defineProps<{ connection: IScraperConnectionResponse }>();

const { busy, requestSync } = useBankSyncFlow();
const { openEdit } = useConnectionEditor();
const { open: openRunDialog } = useSyncRunDialog();

const copy = computed(() => failureStripFor(props.connection));

const onAction = () => {
    const action = copy.value?.action;
    if (action === "update-login") openEdit(props.connection, { focusLogin: true });
    else if (action === "retry") requestSync({ connectionId: props.connection.id });
};

const openDetails = () => {
    if (!copy.value) return;
    openRunDialog(copy.value.syncJobId, { expandConnectionId: props.connection.id });
};
</script>

<template>
    <div
        v-if="copy"
        class="relative flex items-center gap-2 rounded-md border border-[color:var(--p-sync-error-border)] bg-[color:var(--p-sync-error-background)] px-3 py-2 text-sm text-[color:var(--p-sync-error-color)]"
    >
        <button
            type="button"
            class="absolute inset-0 rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
            :aria-label="`${copy.short}, see details`"
            @click="openDetails"
        />
        <i
            class="pi pi-exclamation-circle shrink-0"
            aria-hidden="true"
        />
        <span class="min-w-0 flex-1 truncate font-semibold">{{ copy.short }}</span>
        <Button
            v-if="copy.action"
            :label="SYNC_ERROR_ACTION_LABEL[copy.action]"
            :disabled="copy.action === 'retry' && busy"
            outlined
            size="small"
            class="relative z-10 shrink-0"
            @click="onAction"
        />
        <i
            class="pi pi-chevron-right shrink-0"
            aria-hidden="true"
        />
    </div>
</template>
