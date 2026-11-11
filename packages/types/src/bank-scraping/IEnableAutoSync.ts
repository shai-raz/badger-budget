import type { AutoSyncDurationDays } from "@badger/shared-data";
import type { IAutoSyncScheduleFields } from "./IAutoSyncScheduleFields";

/** Turns auto-sync on. The PIN proves the user; `key` is the device-held key, base64url, 32 bytes. */
export interface IEnableAutoSync extends Omit<
    IAutoSyncScheduleFields,
    "windowStartMinute" | "windowEndMinute" | "runAtMinute"
> {
    windowStartMinute?: number | null;
    windowEndMinute?: number | null;
    runAtMinute?: number | null;
    pin: string;
    key: string;
    deviceLabel: string;
    durationDays?: AutoSyncDurationDays;
}
