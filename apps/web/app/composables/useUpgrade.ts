import { computed, ref, watch } from "vue";
import { useMutation } from "@tanstack/vue-query";
import { useToast } from "primevue/usetoast";
import { useApiClient } from "./useApiClient";
import { useUpdateNotice } from "./useUpdateNotice";
import { useAuthStore } from "~/stores/auth";
import { reloadToNewBuild } from "~/utils/reloadToNewBuild";
import {
    PENDING_UPGRADE_KEY,
    parsePendingUpgrade,
    tabView,
    upgradeActionState,
    type PendingUpgrade,
} from "~/utils/upgradeTracking";

export const UPGRADE_TOAST_GROUP = "upgrade";

// This tab's own copy of the upgrade it last saw ready. Module scope, so every consumer in the tab (toast, dialog,
// nav items, each page header) reads the same copy. In memory only: it keeps Reload working after another tab
// reached done and cleared the shared entry.
const held = ref<PendingUpgrade | null>(null);

const sameUpgrade = (a: PendingUpgrade | null, b: PendingUpgrade | null): boolean =>
    a === b || (a !== null && b !== null && JSON.stringify(a) === JSON.stringify(b));

/** Shared upgrade state for this browser: the pending upgrade, its phase, and the trigger/reload actions. */
export const useUpgrade = () => {
    const apiClient = useApiClient();
    const authStore = useAuthStore();
    const toast = useToast();
    const buildId = useRuntimeConfig().app.buildId;
    const { info } = useUpdateNotice();
    // The shared entry: the upgrade this browser started, keyed by user. The server stays the source of truth.
    const stored = useLocalStorage<string | null>(PENDING_UPGRADE_KEY, null);
    const now = useNow({ interval: 15_000 });

    const view = computed(() => {
        const userId = authStore.user?.id ?? null;
        // The copy is module scope, so it outlives a sign-out. Another user in the same tab must not inherit it.
        const ownHeld = held.value?.userId === userId ? held.value : null;
        return tabView(parsePendingUpgrade(stored.value, userId), ownHeld, info.value, buildId, now.value.getTime());
    });
    const pending = computed(() => view.value.entry);
    const phase = computed(() => view.value.phase);
    const actionState = computed(() => upgradeActionState(info.value, phase.value));

    // Records what this tab learned: its own copy, and the live stamp on the shared entry. Immediate, so a fresh load
    // runs it at setup. `held` is written only on a real change: the shared entry is re-parsed on every read, so a
    // plain assignment would re-trigger this watcher forever.
    watch(
        view,
        (next) => {
            if (!sameUpgrade(held.value, next.held)) held.value = next.held;
            if (next.stamp) stored.value = JSON.stringify(next.stamp);
        },
        { immediate: true },
    );

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

    // The first tab that sees the finished upgrade takes the done toast and clears the shared entry. Other tabs keep
    // their own copy, so they still show Reload until they reload; later loads and new tabs find nothing to announce.
    const claimDoneToast = (): { version: string | null } | null => {
        const done = view.value.done;
        if (!done) return null;
        clear();
        return done;
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
        reloadNow: reloadToNewBuild,
        showStarted,
    };
};
