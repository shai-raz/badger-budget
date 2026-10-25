<script setup lang="ts">
import { useBankSyncFlow } from "~/composables/bankSync/useBankSyncFlow";
import type { ButtonProps } from "primevue/button";
defineProps<{
    defaultCurrencyCode?: string;
    size?: ButtonProps["size"];
    iconOnly?: boolean;
}>();
const { activeJobId, syncedCount, buttonLoading, busy, requestSync } = useBankSyncFlow();
</script>

<template>
    <!-- Idle state -->
    <div v-if="!activeJobId">
        <Button
            icon="pi pi-sync"
            :size="size"
            :label="iconOnly ? undefined : 'Sync'"
            :aria-label="iconOnly ? 'Sync' : undefined"
            :text="iconOnly"
            :rounded="iconOnly"
            :loading="buttonLoading"
            :disabled="busy"
            @click="requestSync({ defaultCurrencyCode })"
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
