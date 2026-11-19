<script setup lang="ts">
import { useToast } from "primevue/usetoast";
import { aboutStatus, shortCommit, type AboutStatusKind } from "../../utils/about";
import { RELEASES_URL } from "../../utils/updateNotice";
import { useCheckForUpdates, useSystemInfo } from "../../composables/useSystemInfo";
import { useUpgrade } from "../../composables/useUpgrade";
import { useUpdateDialog } from "../../composables/useUpdateDialog";
import { useWhatsNewDialog } from "../../composables/useWhatsNewDialog";

interface HttpError {
    response?: { data?: { message?: string } };
}

definePageMeta({
    layout: "app",
    fullBleed: true,
});

const STATUS_ICON: Record<AboutStatusKind, string> = {
    "up-to-date": "pi pi-check-circle text-green-600 dark:text-green-400",
    update: "pi pi-arrow-circle-up text-sky-600 dark:text-sky-400",
    "update-upgradeable": "pi pi-arrow-circle-up text-sky-600 dark:text-sky-400",
    upgrading: "pi pi-spin pi-spinner",
    "checks-off": "pi pi-ban text-muted-color",
    "dev-build": "pi pi-code text-muted-color",
    "not-checked": "pi pi-info-circle text-muted-color",
};

const toast = useToast();
const { data: info, isLoading, error } = useSystemInfo();
const checkMutation = useCheckForUpdates();
const { phase, pending, actionState } = useUpgrade();
const { openConfirm } = useUpdateDialog();
const { openRecent } = useWhatsNewDialog();

const status = computed(() =>
    info.value ? aboutStatus(info.value, phase.value, pending.value?.targetVersion ?? null) : null,
);
const commit = computed(() => shortCommit(info.value?.commit ?? null));
// The row needs something to show: Upgrade now (when enabled here) or the release notes link.
const showActions = computed(() => {
    if (status.value?.kind === "update-upgradeable") return actionState.value !== "hidden" || !!info.value?.releaseUrl;
    return status.value?.kind === "update" && !!info.value?.releaseUrl;
});
const whatsNewSubtitle = computed(() => (info.value?.version ? `What changed in ${info.value.version}` : null));

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
    <div class="flex flex-col gap-3 pb-8 md:gap-6">
        <LayoutPageHeader
            title="About"
            back-to="/settings"
        >
            <template #actions>
                <LayoutHeaderButton
                    label="Check for updates"
                    icon="pi pi-refresh"
                    aria-label="Check for updates"
                    :loading="checkMutation.isPending.value"
                    :disabled="!info?.updateCheckEnabled || !info?.updateComparable"
                    @click="handleCheck"
                />
            </template>
        </LayoutPageHeader>

        <SharedSectionBand
            title="Version"
            heading-id="version-heading"
            :loading="isLoading"
            :error="info ? undefined : error"
        >
            <div
                v-if="status"
                role="status"
                class="flex items-center gap-3 px-4 py-3 md:px-0"
            >
                <i
                    :class="STATUS_ICON[status.kind]"
                    aria-hidden="true"
                />
                <div class="flex min-w-0 flex-1 flex-col gap-1">
                    <span class="text-sm font-semibold">{{ status.headline }}</span>
                    <span
                        v-if="status.detail"
                        class="text-xs text-muted-color"
                        >{{ status.detail }}</span
                    >
                </div>
            </div>

            <div
                v-if="status && showActions"
                class="flex flex-wrap items-center gap-3 pr-4 pb-3 pl-11 md:pr-0 md:pl-7"
            >
                <Button
                    v-if="status.kind === 'update-upgradeable' && actionState !== 'hidden'"
                    label="Upgrade now"
                    icon="pi pi-arrow-circle-up"
                    size="small"
                    :disabled="actionState === 'disabled'"
                    @click="openConfirm()"
                />
                <a
                    v-if="info?.releaseUrl"
                    :href="info.releaseUrl"
                    target="_blank"
                    rel="noopener"
                    class="text-sm font-medium text-primary hover:underline"
                    >Release notes
                    <i
                        class="pi pi-arrow-up-right text-xs"
                        aria-hidden="true"
                    ></i
                ></a>
            </div>

            <div class="flex flex-col border-t border-surface-200 px-4 pb-4 md:px-0 md:pb-0 dark:border-surface-700">
                <SharedDetailRow label="Version">{{ info?.version ?? "Unknown" }}</SharedDetailRow>
                <SharedDetailRow
                    v-if="commit"
                    label="Commit"
                >
                    <span
                        class="font-mono"
                        :title="info?.commit ?? undefined"
                        >{{ commit }}</span
                    >
                </SharedDetailRow>
                <SharedDetailRow
                    v-if="info?.latest"
                    label="Latest release"
                    >{{ info.latest }}</SharedDetailRow
                >
            </div>
        </SharedSectionBand>

        <SharedSectionBand
            title="Releases"
            heading-id="releases-heading"
        >
            <div class="flex flex-col divide-y divide-surface-200 dark:divide-surface-700">
                <SettingsRow
                    icon="pi pi-sparkles"
                    title="What's new"
                    :subtitle="whatsNewSubtitle"
                    @click="openRecent()"
                />
                <SettingsRow
                    :href="RELEASES_URL"
                    icon="pi pi-external-link"
                    title="All release notes"
                    subtitle="On GitHub"
                />
            </div>
        </SharedSectionBand>
    </div>
</template>
