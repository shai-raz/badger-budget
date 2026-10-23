<script setup lang="ts">
import { useToast } from "primevue/usetoast";
import { updateStatusLabel } from "../../utils/about";
import { UPGRADE_GUIDE_URL } from "../../utils/updateNotice";

interface HttpError {
    response?: { data?: { message?: string } };
}

// Mounted once in layouts/app.vue. Opened from the nav's "Update available" item, which is shown only while
// useUpdateNotice reports a release this browser has not dismissed.
const toast = useToast();
const { open, closeDialog } = useUpdateDialog();
const { info, dismiss } = useUpdateNotice();
const checkMutation = useCheckForUpdates();

// After a manual check that finds nothing newer, the body shows the status line instead of the update text.
const upToDate = computed(() => checkMutation.isSuccess.value && !!info.value && !info.value.updateAvailable);
const upToDateLabel = computed(() => (info.value ? updateStatusLabel(info.value) : null));

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
</script>

<template>
    <Dialog
        v-model:visible="open"
        class="dialog-compact max-w-[95vw]"
        modal
        :draggable="false"
        :header="upToDate ? 'No update available' : 'Update available'"
        :style="{ width: '28rem' }"
    >
        <div
            v-if="info"
            class="flex flex-col gap-3"
        >
            <p
                v-if="upToDate"
                role="status"
            >
                {{ upToDateLabel }}
            </p>
            <p v-else>You're running version {{ info.version }}. Version {{ info.latest }} is available.</p>
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
            <div class="flex w-full flex-wrap items-center justify-between gap-2">
                <Button
                    v-if="!upToDate"
                    label="Dismiss for this version"
                    severity="secondary"
                    text
                    @click="dismissAndClose"
                />
                <Button
                    label="Check again"
                    icon="pi pi-refresh"
                    severity="secondary"
                    class="ml-auto"
                    :loading="checkMutation.isPending.value"
                    @click="handleCheck"
                />
            </div>
        </template>
    </Dialog>
</template>
