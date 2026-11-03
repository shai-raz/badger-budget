<script setup lang="ts">
import { useBankSyncFlow } from "~/composables/bankSync/useBankSyncFlow";
import { syncButtonLabel } from "~/utils/syncRuns";
import type { ButtonProps } from "primevue/button";
const props = defineProps<{
    defaultCurrencyCode?: string;
    size?: ButtonProps["size"];
    iconOnly?: boolean;
    // Active connections whose latest run failed; a red dot and the failing label show while it is above zero.
    failingCount?: number;
}>();
const { activeJobId, syncedCount, buttonLoading, busy, requestSync } = useBankSyncFlow();

const failingLabel = computed(() => {
    const count = props.failingCount ?? 0;
    return count > 0 ? syncButtonLabel(count) : null;
});
</script>

<template>
    <!-- Idle state -->
    <div
        v-if="!activeJobId"
        class="relative inline-flex"
    >
        <Button
            v-tooltip.bottom="failingLabel"
            icon="pi pi-sync"
            :size="size"
            :label="iconOnly ? undefined : 'Sync'"
            :aria-label="failingLabel ?? (iconOnly ? 'Sync' : undefined)"
            :text="iconOnly"
            :rounded="iconOnly"
            :loading="buttonLoading"
            :disabled="busy"
            @click="requestSync({ defaultCurrencyCode })"
        />
        <span
            v-if="failingLabel"
            aria-hidden="true"
            class="pointer-events-none absolute h-2 w-2 rounded-full bg-[var(--p-sync-error-color)] ring-2 ring-surface-0 dark:ring-surface-900"
            :class="iconOnly ? 'right-1.5 top-1.5' : '-right-0.5 -top-0.5'"
        />
    </div>

    <!-- In-progress state (spinner stays visible in both variants) -->
    <div
        v-else
        class="flex h-10 items-center gap-2"
        :class="{ 'w-10 justify-center': iconOnly }"
        :title="iconOnly ? 'Syncing…' : undefined"
    >
        <ProgressSpinner
            style="width: 20px; height: 20px"
            stroke-width="4"
        />
        <span
            v-if="!iconOnly"
            class="text-sm"
            >Syncing{{ syncedCount !== null ? ` · ${syncedCount} txns` : "..." }}</span
        >
    </div>
</template>
