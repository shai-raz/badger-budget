<script setup lang="ts">
import { useToast } from "primevue/usetoast";
import { SYNC_RESULT_TOAST_GROUP, isSyncResultToastData } from "~/composables/bankSync/useBankSyncFlow";
import { useSyncRunDialog } from "~/composables/bankSync/useSyncRunDialog";
import { BELOW_MD } from "~/utils/breakpoints";

const toast = useToast();
const { open: openRunDialog } = useSyncRunDialog();

const toastBreakpoints = {
    [BELOW_MD]: { width: "calc(100vw - 2rem)", left: "1rem", right: "1rem" },
};

const ICONS: Record<string, string> = {
    success: "pi pi-check",
    info: "pi pi-info-circle",
    warn: "pi pi-exclamation-triangle",
    error: "pi pi-times-circle",
};

const seeWhy = (jobId: string) => {
    toast.removeGroup(SYNC_RESULT_TOAST_GROUP);
    openRunDialog(jobId);
};
</script>

<template>
    <Toast
        :group="SYNC_RESULT_TOAST_GROUP"
        :breakpoints="toastBreakpoints"
    >
        <template #message="{ message }">
            <div class="flex min-w-0 flex-1 items-start gap-2">
                <i
                    :class="ICONS[message.severity] ?? 'pi pi-info-circle'"
                    class="p-toast-message-icon"
                    aria-hidden="true"
                />
                <div class="flex min-w-0 flex-1 flex-col items-start gap-1">
                    <span class="p-toast-summary">{{ message.summary }}</span>
                    <span class="p-toast-detail">
                        {{ message.detail }}
                        <button
                            v-if="isSyncResultToastData(message.data) && message.data.seeWhy"
                            type="button"
                            class="ml-1 cursor-pointer whitespace-nowrap font-semibold text-inherit underline"
                            @click="seeWhy(message.data.jobId)"
                        >
                            See why
                        </button>
                    </span>
                </div>
            </div>
        </template>
    </Toast>
</template>
