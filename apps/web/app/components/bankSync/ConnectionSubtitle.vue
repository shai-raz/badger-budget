<script setup lang="ts">
import type { IScraperConnectionResponse } from "@badger/types";
import { connectionSubtitle } from "~/utils/bankConnections";

/** The gray line under a bank connection's name: provider, compact sync age, amber when the sync is stale. */
const props = defineProps<{
    connection: Pick<IScraperConnectionResponse, "companyId" | "lastSyncedAt">;
}>();

// Ticks every minute so the compact sync age stays current.
const now = useNow({ interval: 60_000 });

const parts = computed(() => connectionSubtitle(props.connection, now.value));
</script>

<template>
    <p class="truncate text-xs text-muted-color">
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
