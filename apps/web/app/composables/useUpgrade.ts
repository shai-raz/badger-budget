import { computed } from "vue";
import { useMutation } from "@tanstack/vue-query";
import { useToast } from "primevue/usetoast";
import { useApiClient } from "./useApiClient";
import { useUpdateNotice } from "./useUpdateNotice";
import { useAuthStore } from "~/stores/auth";
import { reloadToNewBuild } from "~/utils/reloadToNewBuild";
import {
    PENDING_UPGRADE_KEY,
    parsePendingUpgrade,
    upgradeActionState,
    upgradePhase,
    type PendingUpgrade,
} from "~/utils/upgradeTracking";

export const UPGRADE_TOAST_GROUP = "upgrade";

/** Shared upgrade state for this browser: the pending upgrade, its phase, and the trigger/reload actions. */
export const useUpgrade = () => {
    const apiClient = useApiClient();
    const authStore = useAuthStore();
    const toast = useToast();
    const buildId = useRuntimeConfig().app.buildId;
    const { info } = useUpdateNotice();
    // Per-browser memory of the upgrade this browser started. The server stays the source of truth.
    const stored = useLocalStorage<string | null>(PENDING_UPGRADE_KEY, null);
    const now = useNow({ interval: 15_000 });

    const pending = computed(() => parsePendingUpgrade(stored.value, authStore.user?.id ?? null));
    const phase = computed(() =>
        pending.value ? upgradePhase(pending.value, info.value, buildId, now.value.getTime()) : null,
    );
    const actionState = computed(() => upgradeActionState(info.value, phase.value));

    const triggerMutation = useMutation({
        mutationFn: async (): Promise<PendingUpgrade> => {
            const userId = authStore.user?.id;
            if (!userId) throw new Error("Not signed in");
            const current = info.value;
            const response = await apiClient.triggerUpgrade();
            const started: PendingUpgrade = {
                userId,
                targetVersion: response.targetVersion ?? current?.latest ?? null,
                fromVersion: current?.version ?? null,
                fromBuildId: buildId,
                startedAt: Date.now(),
            };
            stored.value = JSON.stringify(started);
            return started;
        },
    });

    const clear = () => {
        stored.value = null;
    };

    // Stamps the reload first, so the page that loads the new build reads it as done rather than ready again.
    const reloadNow = async () => {
        const current = pending.value;
        if (current) stored.value = JSON.stringify({ ...current, reloadedAt: Date.now() });
        await reloadToNewBuild();
    };

    const showStarted = (targetVersion: string | null) => {
        toast.add({
            group: UPGRADE_TOAST_GROUP,
            severity: "info",
            summary: targetVersion ? `Upgrading to v${targetVersion}` : "Upgrading",
            detail: "Keep working. The app may be briefly unavailable while it restarts.",
            life: 6000,
        });
    };

    return {
        info,
        pending,
        phase,
        actionState,
        trigger: () => triggerMutation.mutateAsync(),
        triggerPending: triggerMutation.isPending,
        clear,
        reloadNow,
        showStarted,
    };
};
