import type { IAutoSyncStatus } from "./IAutoSyncStatus";

/** GET wraps the status so `null` is a JSON body rather than an empty response. */
export interface IAutoSyncState {
    autoSync: IAutoSyncStatus | null;
}
