import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { useApiClient } from "./useApiClient";
import { systemKeys } from "./useSystemInfo";
import type { IChangelogResponse, IChangelogSeenResponse } from "@badger/types";

// Bundled release notes. The changelog only changes on a deploy, so it is fetched once per app load.
export function useChangelog() {
    const apiClient = useApiClient();

    return useQuery({
        queryKey: systemKeys.changelog(),
        queryFn: (): Promise<IChangelogResponse> => apiClient.getChangelog(),
        staleTime: Infinity,
        retry: false,
    });
}

// Stores the running version as seen. The cache is updated in place so the dialog's list and auto-open
// state follow the server without a refetch.
export function useMarkChangelogSeen() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (): Promise<IChangelogSeenResponse> => apiClient.markChangelogSeen(),
        onSuccess: (data) => {
            queryClient.setQueryData<IChangelogResponse>(systemKeys.changelog(), (old) =>
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
