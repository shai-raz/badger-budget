import type { IAutoSyncScheduleFields } from "./IAutoSyncScheduleFields";

/** Changes the schedule of a running grant. No PIN, duration or credential changes. */
export interface IUpdateAutoSyncSchedule extends Omit<
    IAutoSyncScheduleFields,
    "windowStartMinute" | "windowEndMinute" | "runAtMinute"
> {
    windowStartMinute?: number | null;
    windowEndMinute?: number | null;
    runAtMinute?: number | null;
}
