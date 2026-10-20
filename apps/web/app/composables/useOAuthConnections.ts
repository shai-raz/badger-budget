import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { useApiClient } from "./useApiClient";
import type { IOAuthConnection, IMcpConfig } from "@badger/types";

export const oauthKeys = {
    connections: () => ["oauth-connections"] as const,
    mcpConfig: () => ["mcp-config"] as const,
};

export function useOAuthConnectionsQuery() {
    const apiClient = useApiClient();

    return useQuery({
        queryKey: oauthKeys.connections(),
        queryFn: (): Promise<IOAuthConnection[]> => apiClient.getOAuthConnections(),
    });
}

export function useMcpConfigQuery() {
    const apiClient = useApiClient();

    return useQuery({
        queryKey: oauthKeys.mcpConfig(),
        queryFn: (): Promise<IMcpConfig> => apiClient.getMcpConfig(),
        staleTime: Infinity,
    });
}

export function useRevokeOAuthConnection() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (id: string) => apiClient.revokeOAuthConnection(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: oauthKeys.connections() });
        },
    });
}
