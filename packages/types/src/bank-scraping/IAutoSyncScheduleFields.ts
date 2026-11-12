import type { AutoSyncIntervalUnit } from "@badger/shared-data";

/** The schedule as stored and returned: hours use the window, days use the run time. */
export interface IAutoSyncScheduleFields {
    intervalUnit: AutoSyncIntervalUnit;
    intervalCount: number;
    windowStartMinute: number | null;
    windowEndMinute: number | null;
    runAtMinute: number | null;
    timeZone: string;
}
