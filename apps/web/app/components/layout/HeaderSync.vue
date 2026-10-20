<script setup lang="ts">
import { latestSyncedAt } from "~/utils/lastSynced";
import { formatTimeAgo, formatTimeAgoCompact } from "~/utils/relativeTime";

// Shared header Sync: the last-sync label plus SyncButton. Desktop shows the long label, mobile the compact one.
const isDesktop = useIsDesktop();

// Ticks every minute so the "Synced N ago" label stays current on an open page instead of freezing.
const now = useNow({ interval: 60_000 });

const { data: connections } = useScraperConnectionsQuery();
const lastSyncedAt = computed(() => latestSyncedAt(connections.value));
</script>

<template>
    <!-- Mount one SyncButton only: it owns a Toast and the PIN Dialog. -->
    <div
        v-if="isDesktop"
        class="flex items-center gap-3"
    >
        <span
            v-if="lastSyncedAt"
            class="text-sm text-surface-500 dark:text-surface-400"
        >
            Synced {{ formatTimeAgo(lastSyncedAt, now) }}
        </span>
        <SyncButton />
    </div>
    <div
        v-else
        class="flex items-center gap-1"
    >
        <span
            v-if="lastSyncedAt"
            class="text-xs text-surface-500 dark:text-surface-400"
        >
            {{ formatTimeAgoCompact(lastSyncedAt, now) }}
        </span>
        <SyncButton icon-only />
    </div>
</template>
