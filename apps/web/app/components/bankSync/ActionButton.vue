<script setup lang="ts">
import { SYNC_ERROR_ACTION } from "~/utils/syncErrors";
import type { SyncErrorAction } from "~/utils/syncErrors";

// The Update login / Retry button on a failed-sync strip and in its run dialog. A small, soft outline drawn from the
// sync-error tokens, so it sits on the red tint and on a plain dialog surface alike. Attrs (class, click) fall through.
const props = defineProps<{ action: SyncErrorAction; disabled?: boolean }>();

const copy = computed(() => SYNC_ERROR_ACTION[props.action]);
</script>

<template>
    <Button
        :label="copy.label"
        :icon="copy.icon"
        :disabled="disabled"
        outlined
        size="small"
        class="h-7 rounded-md border-[color:var(--p-sync-error-border)] bg-transparent text-xs font-medium text-[color:var(--p-sync-error-color)] hover:bg-[color:color-mix(in_srgb,var(--p-sync-error-color)_10%,transparent)]"
    />
</template>
