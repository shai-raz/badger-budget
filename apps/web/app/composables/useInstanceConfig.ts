import { useQuery } from "@tanstack/vue-query";
import { useApiClient } from "./useApiClient";
import type { IAppConfigResponse } from "@badger/types";

// Public instance config (feature flags). Works signed out: GET /config needs no token.
export const appConfigKeys = {
    all: ["app-config"] as const,
};

export function useInstanceConfig() {
    const apiClient = useApiClient();

    return useQuery({
        queryKey: appConfigKeys.all,
        queryFn: (): Promise<IAppConfigResponse> => apiClient.getConfig(),
        staleTime: 60_000,
    });
}
