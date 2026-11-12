import {
    AUTO_SYNC_DURATIONS,
    AUTO_SYNC_INTERVAL_LIMITS,
    DEFAULT_AUTO_SYNC_SCHEDULE,
    isAutoSyncDurationAllowed,
    type AutoSyncDurationDays,
    type AutoSyncIntervalUnit,
    type AutoSyncSchedule,
} from "@badger/shared-data";
import type { IAutoSyncStatus } from "@badger/types";
import { formatMinuteOfDay } from "./autoSyncPresets";
import { calendarDaysUntil } from "./relativeTime";

/** The local time of day for a minute count, on the day of `now`. */
export function minuteToDate(minute: number, now: Date = new Date()): Date {
    const date = new Date(now);
    date.setHours(Math.floor(minute / 60), minute % 60, 0, 0);
    return date;
}

/** Minutes since local midnight for a time picked on a Date. */
export function dateToMinute(date: Date): number {
    return date.getHours() * 60 + date.getMinutes();
}

/** The next local occurrence of a time of day: today when it is still ahead, else tomorrow. */
export function nextOccurrence(minute: number, now: Date = new Date()): Date {
    const date = minuteToDate(minute, now);
    if (date.getTime() <= now.getTime()) date.setDate(date.getDate() + 1);
    return date;
}

const dayFormat = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric" });

function sameLocalDay(a: Date, b: Date): boolean {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** "today", "tomorrow" or a short date, lower case so it reads inside a sentence. */
export function syncDayLabel(date: Date, now: Date = new Date()): string {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (sameLocalDay(date, now)) return "today";
    if (sameLocalDay(date, tomorrow)) return "tomorrow";
    return dayFormat.format(date);
}

/** "today at 07:00", for the turn-on dialog's first sync. */
export function firstSyncLabel(minute: number, now: Date = new Date()): string {
    const next = nextOccurrence(minute, now);
    return `${syncDayLabel(next, now)} at ${formatMinuteOfDay(minute)}`;
}

/** "07:00–22:00" for an hourly window, "at 07:00" for a daily run time. */
export function scheduleWindowLabel(schedule: AutoSyncSchedule): string {
    if (schedule.intervalUnit === "hours") {
        return `${formatMinuteOfDay(schedule.windowStartMinute)}–${formatMinuteOfDay(schedule.windowEndMinute)}`;
    }
    return `at ${formatMinuteOfDay(schedule.runAtMinute)}`;
}

/** The stored status as the schedule the form edits. Falls back to the default when a field is missing. */
export function scheduleFromStatus(status: IAutoSyncStatus): AutoSyncSchedule {
    if (status.intervalUnit === "hours") {
        if (status.windowStartMinute === null || status.windowEndMinute === null) return DEFAULT_AUTO_SYNC_SCHEDULE;
        return {
            intervalUnit: "hours",
            intervalCount: status.intervalCount,
            windowStartMinute: status.windowStartMinute,
            windowEndMinute: status.windowEndMinute,
        };
    }
    if (status.runAtMinute === null) return DEFAULT_AUTO_SYNC_SCHEDULE;
    return { intervalUnit: "days", intervalCount: status.intervalCount, runAtMinute: status.runAtMinute };
}

/** Error under the interval number, or null. Hours stop at 23: longer intervals are days. */
export function intervalCountError(unit: AutoSyncIntervalUnit, count: number | null): string | null {
    const { min, max } = AUTO_SYNC_INTERVAL_LIMITS[unit];
    if (count === null || !Number.isInteger(count)) return "Enter a whole number.";
    if (count < min) return `At least ${min}.`;
    if (count > max) return unit === "hours" ? "Up to 23 hours. For more, use days." : `Up to ${max} days.`;
    return null;
}

/** The preferred duration when it covers two intervals, else the shortest one that does. */
export function firstAllowedDuration(
    preferred: AutoSyncDurationDays,
    unit: AutoSyncIntervalUnit,
    count: number,
): AutoSyncDurationDays {
    if (isAutoSyncDurationAllowed(preferred, unit, count)) return preferred;
    return AUTO_SYNC_DURATIONS.find((days) => isAutoSyncDurationAllowed(days, unit, count)) ?? preferred;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** A grant with this many days or fewer left shows its expiry and the Keep on action. */
export const EXPIRING_WITHIN_DAYS = 3;

/** Whole days left on a grant that expires within EXPIRING_WITHIN_DAYS, or null while it has longer to run. */
export function expiringDaysLeft(expiresAt: string, now: Date = new Date()): number | null {
    const msLeft = new Date(expiresAt).getTime() - now.getTime();
    if (msLeft > EXPIRING_WITHIN_DAYS * DAY_MS) return null;
    return Math.max(1, Math.ceil(msLeft / DAY_MS));
}

/** "today", "yesterday" or a short date, for when an unreachable device last ran a sync. */
export function lastSyncDayLabel(date: Date, now: Date = new Date()): string {
    const daysAgo = -calendarDaysUntil(date, now);
    if (daysAgo <= 0) return "today";
    if (daysAgo === 1) return "yesterday";
    return dayFormat.format(date);
}
