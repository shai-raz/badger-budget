import { computed, toValue, type MaybeRefOrGetter } from "vue";
import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { useApiClient } from "./useApiClient";
import { useAuthStore } from "~/stores/auth";
import type { ISystemInfo } from "@badger/types";

export const systemKeys = {
    all: ["system"] as const,
    // upgradeAvailable depends on the viewer's role, so the entry is keyed by the signed-in user.
    info: (userId?: string) => [...systemKeys.all, "info", userId] as const,
    changelog: (userId?: string) => [...systemKeys.all, "changelog", userId] as const,
};

export interface SystemInfoOptions {
    /** Poll interval in ms, or false for none. A computed so the observer re-arms its timer when the value changes. */
    refetchInterval?: MaybeRefOrGetter<number | false>;
}

// Running version and latest-release info. Errors stay silent: the About card falls back to "Unknown".
export function useSystemInfo(enabled: MaybeRefOrGetter<boolean> = true, options: SystemInfoOptions = {}) {
    const apiClient = useApiClient();
    const authStore = useAuthStore();
    const userId = computed(() => authStore.user?.id);

    return useQuery({
        queryKey: computed(() => systemKeys.info(userId.value)),
        queryFn: (): Promise<ISystemInfo> => apiClient.getSystemInfo(),
        staleTime: 60 * 60_000,
        retry: false,
        enabled: computed(() => toValue(enabled)),
        refetchInterval: computed(() => toValue(options.refetchInterval) ?? false),
    });
}

export function useCheckForUpdates() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    const authStore = useAuthStore();

    return useMutation({
        mutationFn: (): Promise<ISystemInfo> => apiClient.checkForUpdates(),
        // The user is captured when the check starts, so the entry written belongs to the request's viewer.
        onMutate: () => ({ userId: authStore.user?.id }),
        onSuccess: (data, _variables, context) => {
            queryClient.setQueryData(systemKeys.info(context?.userId), data);
        },
    });
}
