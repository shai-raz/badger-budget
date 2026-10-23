import { computed, toValue, type MaybeRefOrGetter } from "vue";
import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { useApiClient } from "./useApiClient";
import type { ISystemInfo } from "@badger/types";

export const systemKeys = {
    all: ["system"] as const,
    info: () => [...systemKeys.all, "info"] as const,
};

// Running version and latest-release info. Errors stay silent: the About card falls back to "Unknown".
export function useSystemInfo(enabled: MaybeRefOrGetter<boolean> = true) {
    const apiClient = useApiClient();

    return useQuery({
        queryKey: systemKeys.info(),
        queryFn: (): Promise<ISystemInfo> => apiClient.getSystemInfo(),
        staleTime: 60 * 60_000,
        retry: false,
        enabled: computed(() => toValue(enabled)),
    });
}

export function useCheckForUpdates() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (): Promise<ISystemInfo> => apiClient.checkForUpdates(),
        onSuccess: (data) => {
            queryClient.setQueryData(systemKeys.info(), data);
        },
    });
}
