<script setup lang="ts">
import { useToast } from "primevue/usetoast";
import { updateStatusLabel } from "../../utils/about";
import { getApiErrorMessage } from "../../utils/apiError";
import { RESTORE_GUIDE_URL, UPGRADE_GUIDE_URL } from "../../utils/updateNotice";
import { updateDialogMode } from "../../utils/upgradeTracking";
import { UPGRADE_TOAST_GROUP } from "~/composables/useUpgrade";

interface HttpError {
    response?: { data?: { message?: string } };
}

// Mounted once in layouts/app.vue. Opened from the nav's "Update available" item, which is shown only while
// useUpdateNotice reports a release this browser has not dismissed.
const toast = useToast();
const { open, closeDialog } = useUpdateDialog();
const { info, dismiss } = useUpdateNotice();
const checkMutation = useCheckForUpdates();
const { pending, phase, actionState, trigger, triggerPending, showStarted } = useUpgrade();

// Set by "Upgrade now"; the confirm step replaces the body until the user confirms or cancels.
const confirming = ref(false);
watch(open, (isOpen) => {
    if (!isOpen) confirming.value = false;
});

const mode = computed(() => updateDialogMode(info.value, phase.value, confirming.value));

// After a manual check that finds nothing newer, the body shows the status line instead of the update text.
const upToDate = computed(() => checkMutation.isSuccess.value && !!info.value && !info.value.updateAvailable);
const upToDateLabel = computed(() => (info.value ? updateStatusLabel(info.value) : null));

const header = computed(() => {
    if (mode.value === "upgrading") return "Upgrading…";
    if (mode.value === "normal" && upToDate.value) return "No update available";
    return "Update available";
});

const upgradingCopy = computed(() => {
    const target = pending.value?.targetVersion;
    const subject = target ? `Upgrading to v${target}.` : "Upgrading.";
    return `${subject} Keep working; you'll get a notice when it's ready.`;
});

const dismissAndClose = () => {
    dismiss();
    closeDialog();
};

const handleCheck = async () => {
    try {
        await checkMutation.mutateAsync();
    } catch (err: unknown) {
        toast.add({
            severity: "error",
            summary: "Error",
            detail: (err as HttpError).response?.data?.message || "Could not check for updates",
            life: 5000,
        });
    }
};

const startConfirm = () => {
    confirming.value = true;
};

const cancelConfirm = () => {
    confirming.value = false;
};

const handleUpgrade = async () => {
    try {
        const started = await trigger();
        confirming.value = false;
        closeDialog();
        showStarted(started.targetVersion);
    } catch (err: unknown) {
        confirming.value = false;
        toast.add({
            group: UPGRADE_TOAST_GROUP,
            severity: "error",
            summary: "Upgrade failed",
            detail: getApiErrorMessage(err, "Could not start the upgrade"),
            life: 6000,
        });
    }
};
</script>

<template>
    <Dialog
        v-model:visible="open"
        class="dialog-compact max-w-[95vw]"
        modal
        :draggable="false"
        :header="header"
        :style="{ width: '28rem' }"
    >
        <div
            v-if="mode === 'upgrading'"
            class="flex flex-col gap-3"
        >
            <p role="status">{{ upgradingCopy }}</p>
        </div>
        <div
            v-else-if="mode === 'confirm' && info"
            class="flex flex-col gap-3"
        >
            <p>Upgrade to v{{ info.latest }} now? The app restarts and may be unavailable for a minute.</p>
            <p class="text-sm text-muted-color">
                Daily backups run through the backup service.
                <a
                    :href="RESTORE_GUIDE_URL"
                    target="_blank"
                    rel="noopener"
                    class="text-primary hover:underline"
                    >How to restore a backup</a
                >
            </p>
        </div>
        <div
            v-else-if="info"
            class="flex flex-col gap-3"
        >
            <p
                v-if="upToDate"
                role="status"
            >
                {{ upToDateLabel }}
            </p>
            <p v-else>You're running version {{ info.version }}. Version {{ info.latest }} is available.</p>
            <p
                v-if="phase === 'stalled'"
                class="text-sm text-amber-600 dark:text-amber-500"
            >
                The last upgrade didn't finish. Check your host's deployment logs.
            </p>
            <div
                v-if="!upToDate"
                class="flex flex-col gap-1 text-sm"
            >
                <a
                    v-if="info.releaseUrl"
                    :href="info.releaseUrl"
                    target="_blank"
                    rel="noopener"
                    class="text-primary hover:underline"
                    >Release notes</a
                >
                <a
                    :href="UPGRADE_GUIDE_URL"
                    target="_blank"
                    rel="noopener"
                    class="text-primary hover:underline"
                    >How to upgrade</a
                >
            </div>
        </div>

        <template #footer>
            <div
                v-if="mode === 'confirm'"
                class="flex w-full flex-wrap items-center justify-end gap-2"
            >
                <Button
                    label="Cancel"
                    severity="secondary"
                    text
                    @click="cancelConfirm"
                />
                <Button
                    v-if="actionState !== 'hidden'"
                    label="Upgrade now"
                    icon="pi pi-arrow-circle-up"
                    :loading="triggerPending"
                    @click="handleUpgrade"
                />
            </div>
            <div
                v-else
                class="flex w-full flex-wrap items-center justify-between gap-2"
            >
                <Button
                    v-if="mode === 'normal' && !upToDate"
                    label="Dismiss for this version"
                    severity="secondary"
                    text
                    @click="dismissAndClose"
                />
                <div class="ml-auto flex flex-wrap items-center justify-end gap-2">
                    <Button
                        label="Check again"
                        icon="pi pi-refresh"
                        severity="secondary"
                        :loading="checkMutation.isPending.value"
                        @click="handleCheck"
                    />
                    <Button
                        v-if="actionState !== 'hidden'"
                        :label="actionState === 'disabled' ? 'Upgrading…' : 'Upgrade now'"
                        icon="pi pi-arrow-circle-up"
                        :disabled="actionState === 'disabled'"
                        @click="startConfirm"
                    />
                </div>
            </div>
        </template>
    </Dialog>
</template>
