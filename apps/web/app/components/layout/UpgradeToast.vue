<script setup lang="ts">
import { useToast } from "primevue/usetoast";
import type { ToastMessageOptions } from "primevue/toast";
import { UPGRADE_TOAST_GROUP, useUpgrade } from "~/composables/useUpgrade";
import { useSystemInfo } from "~/composables/useSystemInfo";
import { useAuthStore } from "~/stores/auth";
import { BELOW_MD } from "~/utils/breakpoints";
import { upgradePollInterval } from "~/utils/upgradeTracking";

type UpgradeToastKind = "ready" | "stalled";
interface UpgradeToastData {
    kind: UpgradeToastKind;
}

// AppBottomBar measured about 53px at 320 and 375px; 3.75rem leaves room for a wrapped label on top of the
// 0.5rem gap. Below md the toast sits above the bar; the bar is in flow, so this value is the only thing keeping
// the two apart.
const BOTTOM_BAR_HEIGHT = "3.75rem";

const upgradeToastBreakpoints = {
    [BELOW_MD]: {
        width: "calc(100vw - 2rem)",
        left: "1rem",
        right: "1rem",
        top: "auto",
        bottom: `calc(${BOTTOM_BAR_HEIGHT} + env(safe-area-inset-bottom) + 0.5rem)`,
    },
};

const ICONS: Record<string, string> = {
    success: "pi pi-check",
    info: "pi pi-info-circle",
    warn: "pi pi-exclamation-triangle",
    error: "pi pi-times-circle",
};

const kindOf = (message: ToastMessageOptions) =>
    (message as ToastMessageOptions & { data?: UpgradeToastData }).data?.kind;

// Module scope: the ready toast shows once per page load, even after its close button was used.
let readyToastShown = false;

const toast = useToast();
const authStore = useAuthStore();
const { info, phase, pending, reloadNow, clear } = useUpgrade();
const reloading = ref(false);

// Polls only while an upgrade is in flight; the query is shared with useUpdateNotice, so no extra request is made.
useSystemInfo(() => authStore.isAuthenticated, {
    refetchInterval: computed(() => upgradePollInterval(phase.value)),
});

const onReload = async () => {
    reloading.value = true;
    try {
        await reloadNow();
    } finally {
        reloading.value = false;
    }
};

// Closing the stalled toast dismisses the tracked upgrade. Removing a group does not emit close, so the
// done/ready transitions below never trigger this.
const onClose = (event: { message: ToastMessageOptions }) => {
    if (kindOf(event.message) === "stalled") clear();
};

watch(
    phase,
    (next) => {
        const target = pending.value?.targetVersion ?? null;
        if (next === "ready") {
            if (readyToastShown) return;
            readyToastShown = true;
            toast.removeGroup(UPGRADE_TOAST_GROUP);
            toast.add({
                group: UPGRADE_TOAST_GROUP,
                severity: "success",
                summary: target ? `v${target} is ready` : "The new version is ready",
                detail: "Reload to start using it.",
                data: { kind: "ready" },
            } as ToastMessageOptions & { data: UpgradeToastData });
        } else if (next === "stalled") {
            const from = pending.value?.fromVersion ?? null;
            toast.removeGroup(UPGRADE_TOAST_GROUP);
            toast.add({
                group: UPGRADE_TOAST_GROUP,
                severity: "warn",
                summary: "Upgrade stalled",
                detail: from
                    ? `Still on v${from}. Check your host's deployment logs.`
                    : "The new version has not started. Check your host's deployment logs.",
                data: { kind: "stalled" },
            } as ToastMessageOptions & { data: UpgradeToastData });
        } else if (next === "done") {
            clear();
            toast.removeGroup(UPGRADE_TOAST_GROUP);
            const version = info.value?.version;
            if (version) {
                toast.add({
                    group: UPGRADE_TOAST_GROUP,
                    severity: "success",
                    summary: `Upgraded to v${version}`,
                    life: 5000,
                });
            }
        }
    },
    { immediate: true },
);
</script>

<template>
    <Toast
        :group="UPGRADE_TOAST_GROUP"
        :breakpoints="upgradeToastBreakpoints"
        @close="onClose"
    >
        <template #message="{ message }">
            <div class="flex min-w-0 flex-1 items-start gap-2">
                <i
                    :class="ICONS[message.severity as string] ?? 'pi pi-info-circle'"
                    class="p-toast-message-icon"
                    aria-hidden="true"
                />
                <div class="flex min-w-0 flex-1 flex-col items-start gap-2">
                    <span class="p-toast-summary">{{ message.summary }}</span>
                    <span
                        v-if="message.detail"
                        class="p-toast-detail"
                        >{{ message.detail }}</span
                    >
                    <Button
                        v-if="kindOf(message) === 'ready'"
                        label="Reload"
                        severity="success"
                        outlined
                        size="small"
                        :loading="reloading"
                        @click="onReload"
                    />
                </div>
            </div>
        </template>
    </Toast>
</template>
