import { computed } from "vue";
import { useMutation } from "@tanstack/vue-query";
import { useToast } from "primevue/usetoast";
import { useApiClient } from "./useApiClient";
import { useUpdateNotice } from "./useUpdateNotice";
import { useAuthStore } from "~/stores/auth";
import { reloadToNewBuild } from "~/utils/reloadToNewBuild";
import {
    PENDING_UPGRADE_KEY,
    announcesDone,
    doneToastDue,
    parsePendingUpgrade,
    upgradeActionState,
    upgradePhase,
    type PendingUpgrade,
} from "~/utils/upgradeTracking";

export const UPGRADE_TOAST_GROUP = "upgrade";
/** sessionStorage key holding the startedAt of the upgrade this tab reloaded for. Per tab, so other tabs do not inherit it. */
const RELOADED_FOR_KEY = "upgradeReloadedFor";
/** sessionStorage key holding the startedAt whose done toast this tab already showed. Per tab, like RELOADED_FOR_KEY. */
const DONE_SHOWN_FOR_KEY = "upgradeDoneShownFor";

/** Shared upgrade state for this browser: the pending upgrade, its phase, and the trigger/reload actions. */
export const useUpgrade = () => {
    const apiClient = useApiClient();
    const authStore = useAuthStore();
    const toast = useToast();
    const buildId = useRuntimeConfig().app.buildId;
    const { info } = useUpdateNotice();
    // Per-browser memory of the upgrade this browser started. The server stays the source of truth.
    const stored = useLocalStorage<string | null>(PENDING_UPGRADE_KEY, null);
    // Synchronous write: the marker must be stored before the reload it guards starts.
    const reloadedFor = useSessionStorage<number | null>(RELOADED_FOR_KEY, null, { flush: "sync" });
    const doneShownFor = useSessionStorage<number | null>(DONE_SHOWN_FOR_KEY, null, { flush: "sync" });
    const now = useNow({ interval: 15_000 });

    const pending = computed(() => parsePendingUpgrade(stored.value, authStore.user?.id ?? null));
    const reloadedHere = computed(() => pending.value !== null && reloadedFor.value === pending.value.startedAt);
    const phase = computed(() =>
        pending.value
            ? upgradePhase(pending.value, info.value, buildId, now.value.getTime(), reloadedHere.value)
            : null,
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

    // Never clears the shared entry: other tabs on the old build still need it to show Reload. The first tab to see
    // the upgrade finish records completedAt there, so later loads read done quietly. This tab's own marker keeps
    // the done toast to once per upgrade here.
    const claimDoneToast = (): boolean => {
        const current = pending.value;
        if (!current || !doneToastDue(current, doneShownFor.value)) return false;
        if (!announcesDone(current, reloadedHere.value)) return false;
        if (current.completedAt === undefined) {
            stored.value = JSON.stringify({ ...current, completedAt: Date.now() });
        }
        doneShownFor.value = current.startedAt;
        return true;
    };

    // Marks this tab before the reload, so the page that loads the new build reads it as done rather than ready again.
    const reloadNow = async () => {
        const current = pending.value;
        if (current) reloadedFor.value = current.startedAt;
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
        claimDoneToast,
        reloadNow,
        showStarted,
    };
};
