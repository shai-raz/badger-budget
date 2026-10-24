<script setup lang="ts">
import { useToast } from "primevue/usetoast";
import { lastCheckedLabel, shortCommit, updateStatusLabel } from "../../utils/about";

interface HttpError {
    response?: { data?: { message?: string } };
}

const toast = useToast();
const { data: info, isLoading } = useSystemInfo();
const checkMutation = useCheckForUpdates();

const commit = computed(() => shortCommit(info.value?.commit ?? null));
const lastChecked = computed(() => (info.value ? lastCheckedLabel(info.value) : ""));
const statusLabel = computed(() => (info.value ? updateStatusLabel(info.value) : null));

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
    <SharedSectionBand title="About">
        <div class="flex flex-col px-4 pb-4 md:px-0 md:pb-0">
            <SharedDetailRow label="Version">
                <Skeleton
                    v-if="isLoading"
                    width="4rem"
                    height="1rem"
                />
                <template v-else>{{ info?.version ?? "Unknown" }}</template>
            </SharedDetailRow>
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
            <SharedDetailRow
                v-if="info"
                label="Last checked"
                >{{ lastChecked }}</SharedDetailRow
            >

            <div class="flex flex-wrap items-center gap-3 pt-3">
                <Button
                    label="Check for updates"
                    icon="pi pi-refresh"
                    severity="secondary"
                    :loading="checkMutation.isPending.value"
                    :disabled="!info?.updateCheckEnabled"
                    @click="handleCheck"
                />
                <p
                    v-if="info?.updateAvailable"
                    class="text-sm"
                    role="status"
                >
                    Version {{ info.latest }} is available.
                    <a
                        v-if="info.releaseUrl"
                        :href="info.releaseUrl"
                        target="_blank"
                        rel="noopener"
                        class="text-primary hover:underline"
                        >View release</a
                    >
                </p>
                <p
                    v-else-if="statusLabel"
                    class="text-sm text-muted-color"
                    role="status"
                >
                    {{ statusLabel }}
                </p>
            </div>
        </div>
    </SharedSectionBand>
</template>
