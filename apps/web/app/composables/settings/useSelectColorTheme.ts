import { computed, type ComputedRef, type Ref } from "vue";
import { useMutation } from "@tanstack/vue-query";
import { useToast } from "primevue/usetoast";
import type { ColorThemeName } from "@badger/shared-data";
import type { IAuthUser } from "@badger/types";
import { useApiClient } from "../useApiClient";
import { useAuthStore } from "~/stores/auth";
import { useThemeStore } from "~/stores/theme";
import { getApiErrorMessage } from "~/utils/apiError";

interface ColorThemeSaveContext {
    next: ColorThemeName;
    seq: number;
}

// Applies the picked theme at once and saves it to the account. The demo account is shared, so its theme stays on
// this device only.
export function useSelectColorTheme(): {
    select: (name: ColorThemeName) => void;
    isDeviceOnly: ComputedRef<boolean>;
    isSaving: Ref<boolean>;
} {
    const apiClient = useApiClient();
    const authStore = useAuthStore();
    const themeStore = useThemeStore();
    const toast = useToast();

    const isDeviceOnly = computed(() => authStore.user?.isDemo === true);
    // Numbers each pick, so a response for an earlier pick cannot overwrite the user that the latest pick saved.
    let latestPick = 0;
    // The last theme the account saved, and the pick that saved it. A failed latest pick reverts to this, not to the
    // theme before it, which may have been a pick that never saved.
    let savedTheme: ColorThemeName = themeStore.colorTheme;
    let savedSeq = 0;

    const mutation = useMutation({
        mutationFn: (name: ColorThemeName): Promise<IAuthUser> => apiClient.updateMe({ colorTheme: name }),
        onMutate: (name): ColorThemeSaveContext => {
            themeStore.applyColorTheme(name);
            latestPick += 1;
            return { next: name, seq: latestPick };
        },
        onSuccess: (user, _name, ctx) => {
            if (!ctx) return;
            if (ctx.seq > savedSeq) {
                savedTheme = ctx.next;
                savedSeq = ctx.seq;
            }
            if (ctx.seq === latestPick) authStore.user = user;
        },
        onError: (err, _name, ctx) => {
            // A failed save of an earlier pick must not undo a newer one that is already on screen.
            if (ctx?.seq === latestPick) themeStore.applyColorTheme(savedTheme);
            toast.add({
                severity: "error",
                summary: "Couldn't save your theme",
                detail: getApiErrorMessage(err, "Please try again."),
                life: 5000,
            });
        },
    });

    function select(name: ColorThemeName) {
        if (name === themeStore.colorTheme) return;
        if (isDeviceOnly.value) {
            themeStore.applyColorTheme(name);
            return;
        }
        mutation.mutate(name);
    }

    return { select, isDeviceOnly, isSaving: mutation.isPending };
}
