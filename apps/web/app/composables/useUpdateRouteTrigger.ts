import { watch } from "vue";
import { useToast } from "primevue/usetoast";
import { useSystemInfo } from "./useSystemInfo";
import { useUpdateDialog } from "./useUpdateDialog";
import { UPGRADE_TOAST_GROUP, useUpgrade } from "./useUpgrade";
import { useAuthStore } from "~/stores/auth";
import { parseUpdateTrigger, updateTriggerAction, type UpdateTrigger } from "~/utils/upgradeTracking";

/**
 * Consumes `?update=open|upgrade` once: the param is removed before anything else, so a reload or back navigation
 * cannot repeat the action. Mounted once in layouts/app.vue.
 */
export const useUpdateRouteTrigger = () => {
    const route = useRoute();
    const router = useRouter();
    const authStore = useAuthStore();
    const toast = useToast();
    const { refetch } = useSystemInfo(() => authStore.isAuthenticated);
    const { openDialog } = useUpdateDialog();
    const { startUpgrade, phase, pending, showStarted } = useUpgrade();

    const consume = async (trigger: UpdateTrigger) => {
        const rest = { ...route.query };
        delete rest.update;
        await router.replace({ query: rest });
        if (!authStore.isAuthenticated) return;

        // Fresh info, not the persisted hourly cache: the action must match what the server reports now.
        const fresh = (await refetch()).data ?? null;
        switch (updateTriggerAction(trigger, fresh, phase.value)) {
            case "open-dialog":
                openDialog();
                return;
            case "start-upgrade":
                await startUpgrade();
                return;
            case "track":
                // Already in flight: show its progress toast again, replacing any copy this tab still has.
                toast.removeGroup(UPGRADE_TOAST_GROUP);
                showStarted(pending.value?.targetVersion ?? null);
                return;
            case "ignore":
                return;
        }
    };

    watch(
        () => route.query.update,
        (raw) => {
            const trigger = parseUpdateTrigger(raw);
            if (trigger !== null) void consume(trigger);
        },
        { immediate: true },
    );
};
