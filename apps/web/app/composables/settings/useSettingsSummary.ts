import { computed } from "vue";
import { useQuery } from "@tanstack/vue-query";
import type { ISettingsSummary } from "@badger/types";
import { useApiClient } from "../useApiClient";
import { useAuthStore } from "~/stores/auth";

// Keyed by user id, like userSettingsKeys: the cache survives logout.
export const settingsSummaryKeys = {
    all: ["settingsSummary"] as const,
    detail: (userId: string | undefined) => [...settingsSummaryKeys.all, userId] as const,
};

// Counts change from mutations on other pages that don't invalidate this key, so it always refetches on mount.
export function useSettingsSummaryQuery() {
    const apiClient = useApiClient();
    const authStore = useAuthStore();
    const userId = computed(() => authStore.user?.id);

    return useQuery({
        queryKey: computed(() => settingsSummaryKeys.detail(userId.value)),
        queryFn: (): Promise<ISettingsSummary> => apiClient.getSettingsSummary(),
        enabled: computed(() => !!userId.value),
        staleTime: 0,
        refetchOnMount: "always",
    });
}
