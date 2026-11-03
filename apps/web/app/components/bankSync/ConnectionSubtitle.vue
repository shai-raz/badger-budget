<script setup lang="ts">
import type { IScraperConnectionResponse } from "@badger/types";
import { connectionSubtitle } from "~/utils/bankConnections";
import type { ConnectionSyncState } from "~/utils/syncRuns";

/** The gray line under a bank connection's name: provider, compact sync age, amber when the sync is stale. While the
 * connection is in a sync run it shows Syncing… or Waiting to sync instead. */
const props = defineProps<{
    connection: Pick<IScraperConnectionResponse, "companyId" | "lastSyncedAt">;
    syncState?: ConnectionSyncState | null;
}>();

// Ticks every minute so the compact sync age stays current.
const now = useNow({ interval: 60_000 });

const parts = computed(() => connectionSubtitle(props.connection, now.value));
</script>

<template>
    <p
        v-if="syncState === 'running'"
        class="flex min-w-0 items-center gap-1 text-xs font-medium text-color"
    >
        <i
            class="pi pi-spinner pi-spin shrink-0 text-[11px]"
            aria-hidden="true"
        ></i>
        <span class="truncate">{{ parts.provider }} · Syncing…</span>
    </p>
    <p
        v-else-if="syncState === 'pending'"
        class="flex min-w-0 items-center gap-1 text-xs text-muted-color"
    >
        <i
            class="pi pi-clock shrink-0 text-[11px]"
            aria-hidden="true"
        ></i>
        <span class="truncate">{{ parts.provider }} · Waiting to sync</span>
    </p>
    <p
        v-else
        class="truncate text-xs text-muted-color"
    >
        {{ parts.provider }} ·
        <span :class="parts.stale ? 'text-amber-600' : undefined">
            <i
                v-if="parts.stale"
                class="pi pi-exclamation-circle text-[11px]"
                aria-hidden="true"
            ></i>
            {{ parts.syncAge }}
        </span>
    </p>
</template>
