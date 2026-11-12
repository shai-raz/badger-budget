import type { AutoSyncDurationDays } from "@badger/shared-data";
import type { IAutoSyncScheduleFields } from "./IAutoSyncScheduleFields";
import type { IAutoSyncConnectionRef } from "./IAutoSyncConnectionRef";

export interface IAutoSyncStatus extends IAutoSyncScheduleFields {
    id: string;
    deviceLabel: string;
    durationDays: AutoSyncDurationDays;
    expiresAt: string;
    /** The scheduled run before jitter; the following slot is anchored on it. */
    nextRunAt: string;
    lastRunAt: string | null;
    missedRuns: number;
    unreachable: boolean;
    createdAt: string;
    includedConnections: IAutoSyncConnectionRef[];
    notIncludedConnections: IAutoSyncConnectionRef[];
}
