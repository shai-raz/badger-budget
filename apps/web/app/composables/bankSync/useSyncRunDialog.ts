/** Opens the sync details dialog for one run. Shared state so the layout's dialog and any entry point use one dialog. */
export const useSyncRunDialog = () => {
    const state = useState<{ visible: boolean; jobId: string | null; expandConnectionId: string | null }>(
        "sync-run-dialog",
        () => ({ visible: false, jobId: null, expandConnectionId: null }),
    );

    return {
        state,
        open: (jobId: string, opts?: { expandConnectionId?: string }) => {
            state.value = { visible: true, jobId, expandConnectionId: opts?.expandConnectionId ?? null };
        },
        close: () => {
            state.value = { ...state.value, visible: false };
        },
    };
};
