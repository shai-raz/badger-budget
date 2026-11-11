import { computed } from "vue";
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import type { ApiClient } from "@badger/api-client";
import type { IUpdateNotificationPreferencesRequest } from "@badger/types";
import { useApiClient } from "../useApiClient";
import { useAuthStore } from "~/stores/auth";

// Per-user entries: the query cache survives logout, so one user's devices or preferences must not show for the next sign-in.
export const notificationKeys = {
    all: ["notifications"] as const,
    vapidKey: ["notifications", "vapidKey"] as const,
    subscriptions: (userId: string | undefined) => ["notifications", "subscriptions", userId] as const,
    preferences: (userId: string | undefined) => ["notifications", "preferences", userId] as const,
};

// Shared with usePushDevice, which reads it through fetchQuery so it reuses the cached key.
export function vapidPublicKeyOptions(apiClient: ApiClient) {
    return {
        queryKey: notificationKeys.vapidKey,
        queryFn: () => apiClient.getVapidPublicKey(),
        staleTime: Infinity,
    };
}

export function useVapidPublicKeyQuery() {
    const apiClient = useApiClient();
    const authStore = useAuthStore();
    const userId = computed(() => authStore.user?.id);

    return useQuery({
        ...vapidPublicKeyOptions(apiClient),
        enabled: computed(() => !!userId.value),
    });
}

export function usePushSubscriptionsQuery() {
    const apiClient = useApiClient();
    const authStore = useAuthStore();
    const userId = computed(() => authStore.user?.id);

    return useQuery({
        queryKey: computed(() => notificationKeys.subscriptions(userId.value)),
        queryFn: () => apiClient.getPushSubscriptions(),
        enabled: computed(() => !!userId.value),
    });
}

export function useDeletePushSubscriptionMutation() {
    const apiClient = useApiClient();
    const authStore = useAuthStore();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (id: string) => apiClient.deletePushSubscription(id),
        onMutate: () => ({ userId: authStore.user?.id }),
        onSuccess: (_result, _id, context) =>
            queryClient.invalidateQueries({ queryKey: notificationKeys.subscriptions(context?.userId) }),
    });
}

export function useNotificationPreferencesQuery() {
    const apiClient = useApiClient();
    const authStore = useAuthStore();
    const userId = computed(() => authStore.user?.id);

    return useQuery({
        queryKey: computed(() => notificationKeys.preferences(userId.value)),
        queryFn: () => apiClient.getNotificationPreferences(),
        enabled: computed(() => !!userId.value),
    });
}

export function useUpdateNotificationPreferencesMutation() {
    const apiClient = useApiClient();
    const authStore = useAuthStore();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (request: IUpdateNotificationPreferencesRequest) =>
            apiClient.updateNotificationPreferences(request),
        // The user is captured when the save starts, so the entry written belongs to the request's viewer.
        onMutate: () => ({ userId: authStore.user?.id }),
        onSuccess: (preferences, _request, context) => {
            queryClient.setQueryData(notificationKeys.preferences(context?.userId), preferences);
        },
    });
}

export function useSendTestNotificationMutation() {
    const apiClient = useApiClient();

    return useMutation({
        mutationFn: () => apiClient.sendTestNotification(),
    });
}
