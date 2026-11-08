import { computed } from "vue";
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import type { IUpdateUserSettingsRequest, IUserSettings } from "@badger/types";
import { useApiClient } from "../useApiClient";
import { useAuthStore } from "~/stores/auth";

// Keyed by user id: the query cache survives logout, so one user's settings must not show for the next sign-in.
export const userSettingsKeys = {
    all: ["userSettings"] as const,
    detail: (userId: string | undefined) => [...userSettingsKeys.all, userId] as const,
};

export function useUserSettingsQuery() {
    const apiClient = useApiClient();
    const authStore = useAuthStore();
    const userId = computed(() => authStore.user?.id);

    return useQuery({
        queryKey: computed(() => userSettingsKeys.detail(userId.value)),
        queryFn: (): Promise<IUserSettings> => apiClient.getMySettings(),
        enabled: computed(() => !!userId.value),
    });
}

export function useUpdateUserSettingsMutation() {
    const apiClient = useApiClient();
    const authStore = useAuthStore();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (patch: IUpdateUserSettingsRequest): Promise<IUserSettings> => apiClient.updateMySettings(patch),
        // The user is captured when the save starts, so the entry written belongs to the request's viewer.
        onMutate: () => ({ userId: authStore.user?.id }),
        onSuccess: (settings, _patch, context) => {
            queryClient.setQueryData(userSettingsKeys.detail(context?.userId), settings);
        },
    });
}
