import { computed } from "vue";
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { useApiClient } from "./useApiClient";
import { systemKeys } from "./useSystemInfo";
import { useAuthStore } from "~/stores/auth";
import type { IChangelogResponse, IChangelogSeenResponse } from "@badger/types";

// Bundled release notes. The changelog only changes on a deploy, so it is fetched once per app load.
// The response carries per-user state (lastSeenVersion, unseen), so the cache entry is keyed by the signed-in
// user: a different user in the same tab never reads the previous user's entry.
export function useChangelog() {
    const apiClient = useApiClient();
    const authStore = useAuthStore();
    const userId = computed(() => authStore.user?.id);

    return useQuery({
        queryKey: computed(() => systemKeys.changelog(userId.value)),
        queryFn: (): Promise<IChangelogResponse> => apiClient.getChangelog(),
        enabled: computed(() => !!userId.value),
        staleTime: Infinity,
        retry: false,
    });
}

// Stores the running version as seen. The cache is updated in place so the dialog's list and auto-open
// state follow the server without a refetch. The user is captured when the stamp starts, so the cache entry
// written is the one that made the request.
export function useMarkChangelogSeen() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    const authStore = useAuthStore();

    return useMutation({
        mutationFn: (): Promise<IChangelogSeenResponse> => apiClient.markChangelogSeen(),
        onMutate: () => ({ userId: authStore.user?.id }),
        onSuccess: (data, _variables, context) => {
            queryClient.setQueryData<IChangelogResponse>(systemKeys.changelog(context?.userId), (old) =>
                old
                    ? {
                          ...old,
                          lastSeenVersion: data.lastSeenVersion,
                          showOnStart: false,
                          releases: old.releases.map((release) => ({ ...release, unseen: false })),
                      }
                    : old,
            );
        },
    });
}
