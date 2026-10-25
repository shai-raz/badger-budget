import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { useApiClient } from "../useApiClient";
import type {
    IScraperConnectionResponse,
    ISyncJob,
    ISyncPasskey,
    ICreateScraperConnection,
    IUpdateScraperConnection,
} from "@badger/types";
import type { Ref } from "vue";

// Query keys
export const bankSyncKeys = {
    activeJob: () => ["bank-sync", "active-job"] as const,
    job: (id: string) => ["bank-sync", "job", id] as const,
    connections: () => ["bank-sync", "connections"] as const,
    pinStatus: () => ["bank-sync", "pin-status"] as const,
    passkeys: () => ["bank-sync", "passkeys"] as const,
};

export function useActiveSyncJobQuery() {
    const apiClient = useApiClient();

    return useQuery({
        queryKey: bankSyncKeys.activeJob(),
        queryFn: (): Promise<ISyncJob | null> => apiClient.getActiveSyncJob(),
        staleTime: 0,
        refetchInterval: false,
    });
}

export function useSyncJobQuery(jobId: Ref<string | null>) {
    const apiClient = useApiClient();

    return useQuery({
        queryKey: computed(() => bankSyncKeys.job(jobId.value ?? "")),
        queryFn: (): Promise<ISyncJob> => apiClient.getSyncJob(jobId.value!),
        enabled: computed(() => !!jobId.value),
        refetchInterval: (query) => {
            const status = query.state.data?.status;
            return status === "pending" || status === "running" ? 3000 : false;
        },
    });
}

export function useScraperConnectionsQuery() {
    const apiClient = useApiClient();

    return useQuery({
        queryKey: bankSyncKeys.connections(),
        queryFn: (): Promise<IScraperConnectionResponse[]> => apiClient.getScraperConnections(),
    });
}

export function useSyncPinStatusQuery() {
    const apiClient = useApiClient();

    return useQuery({
        queryKey: bankSyncKeys.pinStatus(),
        queryFn: () => apiClient.getSyncPinStatus(),
    });
}

export function useSyncPasskeysQuery() {
    const apiClient = useApiClient();
    const pinStatus = useSyncPinStatusQuery();

    return useQuery({
        queryKey: bankSyncKeys.passkeys(),
        queryFn: (): Promise<ISyncPasskey[]> => apiClient.getSyncPasskeys(),
        enabled: computed(() => pinStatus.data.value?.hasPinSet === true),
    });
}

export function useDeleteSyncPasskeyMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (id: string) => apiClient.deleteSyncPasskey(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: bankSyncKeys.passkeys() });
        },
    });
}

export function useTriggerSyncMutation() {
    const apiClient = useApiClient();

    return useMutation<{ jobId: string }, Error, { pin: string; defaultCurrencyCode?: string }>({
        mutationFn: ({ pin, defaultCurrencyCode }) => apiClient.triggerSync(pin, defaultCurrencyCode),
    });
}

export function useTriggerConnectionSyncMutation() {
    const apiClient = useApiClient();
    return useMutation({
        mutationFn: ({
            connectionId,
            pin,
            defaultCurrencyCode,
        }: {
            connectionId: string;
            pin: string;
            defaultCurrencyCode?: string;
        }) => apiClient.triggerConnectionSync(connectionId, pin, defaultCurrencyCode),
    });
}

export function useSetSyncPinMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (pin: string) => apiClient.setSyncPin(pin),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: bankSyncKeys.pinStatus() });
            queryClient.invalidateQueries({ queryKey: bankSyncKeys.passkeys() });
        },
    });
}

export function useCreateScraperConnectionMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (data: ICreateScraperConnection) => apiClient.createScraperConnection(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: bankSyncKeys.connections() });
            queryClient.invalidateQueries({ queryKey: bankSyncKeys.pinStatus() });
        },
    });
}

export function useUpdateScraperConnectionMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ id, data }: { id: string; data: IUpdateScraperConnection }) =>
            apiClient.updateScraperConnection(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: bankSyncKeys.connections() });
        },
    });
}

export function useDeleteScraperConnectionMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (id: string) => apiClient.deleteScraperConnection(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: bankSyncKeys.connections() });
        },
    });
}
