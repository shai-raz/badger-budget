import { computed } from "vue";
import { useUpdateDialog } from "./useUpdateDialog";
import { useUpdateNotice } from "./useUpdateNotice";
import { useUpgrade } from "./useUpgrade";
import { updateNavItem } from "~/utils/upgradeTracking";

/** The update nav item shared by AppSidebar and NavDrawer: what it shows, and what a click does. */
export const useUpdateNavItem = () => {
    const { visible } = useUpdateNotice();
    const { openDialog } = useUpdateDialog();
    const { pending, phase, reloadNow } = useUpgrade();

    const item = computed(() => updateNavItem(visible.value, phase.value, pending.value?.targetVersion ?? null));

    // Ready loads the new build straight away, the user's decision; every other state opens UpdateDialog.
    const activate = () => {
        if (item.value.action === "reload") void reloadNow();
        else openDialog();
    };

    return { item, activate };
};
