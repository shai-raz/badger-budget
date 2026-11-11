import {
    AUTO_SYNC_INTERVAL_LIMITS,
    AUTO_SYNC_MAX_MINUTE,
    autoSyncRunsPerDay,
    isAutoSyncIntervalUnit,
    type AutoSyncIntervalUnit,
    type AutoSyncSchedule,
} from "@badger/shared-data";
import { getZonedDateParts, zonedDateTimeToUtcDate, type LocalDateTimeParts } from "../common/zoned-time.util";

export interface AutoSyncScheduleInput {
    intervalUnit: AutoSyncIntervalUnit;
    intervalCount: number;
    windowStartMinute?: number | null;
    windowEndMinute?: number | null;
    runAtMinute?: number | null;
}

export type ParseScheduleResult = { ok: true; schedule: AutoSyncSchedule } | { ok: false; message: string };

const MESSAGES = {
    unknownUnit: "Choose hours or days.",
    hoursCount: "Up to 23 hours. For more, use days.",
    daysCount: "Up to 7 days.",
    hoursWindowMissing: "Hourly sync needs a start and end time.",
    windowMinute: "Window times must be whole minutes from 0 to 1439.",
    windowSameStartEnd: "Window start and end must differ.",
    hoursRunAt: "Hourly sync does not take a run time.",
    daysRunAt: "Daily sync needs a run time from 0 to 1439.",
    daysWindow: "Daily sync does not take a window.",
} as const;

/** Random offset applied around each scheduled run so sync traffic does not bunch up on the hour. */
export const AUTO_SYNC_JITTER_MS: Readonly<Record<AutoSyncIntervalUnit, number>> = {
    hours: 5 * 60_000,
    days: 20 * 60_000,
};

function isMinuteOfDay(value: unknown): value is number {
    return Number.isInteger(value) && (value as number) >= 0 && (value as number) <= AUTO_SYNC_MAX_MINUTE;
}

/** Validates user input against the schedule rules and returns the normalised model. */
export function parseAutoSyncSchedule(input: AutoSyncScheduleInput): ParseScheduleResult {
    if (!isAutoSyncIntervalUnit(input.intervalUnit)) {
        return { ok: false, message: MESSAGES.unknownUnit };
    }

    const unit = input.intervalUnit;
    const { intervalCount } = input;
    const limits = AUTO_SYNC_INTERVAL_LIMITS[unit];

    if (!Number.isInteger(intervalCount) || intervalCount < limits.min || intervalCount > limits.max) {
        return { ok: false, message: unit === "hours" ? MESSAGES.hoursCount : MESSAGES.daysCount };
    }

    if (unit === "hours") {
        const { windowStartMinute, windowEndMinute } = input;

        if (windowStartMinute == null || windowEndMinute == null) {
            return { ok: false, message: MESSAGES.hoursWindowMissing };
        }
        if (!isMinuteOfDay(windowStartMinute) || !isMinuteOfDay(windowEndMinute)) {
            return { ok: false, message: MESSAGES.windowMinute };
        }
        if (windowStartMinute === windowEndMinute) {
            return { ok: false, message: MESSAGES.windowSameStartEnd };
        }
        if (input.runAtMinute != null) {
            return { ok: false, message: MESSAGES.hoursRunAt };
        }

        return {
            ok: true,
            schedule: {
                intervalUnit: "hours",
                intervalCount,
                windowStartMinute,
                windowEndMinute,
            },
        };
    }

    if (!isMinuteOfDay(input.runAtMinute)) {
        return { ok: false, message: MESSAGES.daysRunAt };
    }
    if (input.windowStartMinute != null || input.windowEndMinute != null) {
        return { ok: false, message: MESSAGES.daysWindow };
    }

    return {
        ok: true,
        schedule: {
            intervalUnit: "days",
            intervalCount,
            runAtMinute: input.runAtMinute,
        },
    };
}

/** The canonical IANA id for `timeZone` (Intl matches ids in any case), or null when it is not a zone. */
export function canonicalTimeZone(timeZone: string): string | null {
    try {
        return new Intl.DateTimeFormat("en-US", { timeZone }).resolvedOptions().timeZone;
    } catch (error) {
        if (error instanceof RangeError) return null;
        throw error;
    }
}

interface LocalDate {
    year: number;
    month: number;
    day: number;
}

/** Calendar arithmetic on local dates; Date.UTC keeps it independent of DST. */
function addLocalDays(date: LocalDate, days: number): LocalDate {
    const shifted = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
    return {
        year: shifted.getUTCFullYear(),
        month: shifted.getUTCMonth() + 1,
        day: shifted.getUTCDate(),
    };
}

/** The instant at minuteOfDay on date in timeZone; minutes past 1439 roll onto later local dates. */
function instantAt(date: LocalDate, minuteOfDay: number, timeZone: string): Date {
    const dayShift = Math.floor(minuteOfDay / 1440);
    const minute = minuteOfDay % 1440;
    const target = addLocalDays(date, dayShift);
    const parts: LocalDateTimeParts = {
        year: target.year,
        month: target.month,
        day: target.day,
        hour: Math.floor(minute / 60),
        minute: minute % 60,
        second: 0,
        millisecond: 0,
    };
    return zonedDateTimeToUtcDate(parts, timeZone);
}

function localDateOf(instant: Date, timeZone: string): LocalDate {
    const parts = getZonedDateParts(instant, timeZone);
    return { year: parts.year, month: parts.month, day: parts.day };
}

/**
 * The first scheduled run strictly after max(now, previousScheduled). Hourly slots sit on a fixed
 * daily grid in the local zone, so DST changes move the UTC instant but not the wall-clock time.
 */
export function nextScheduledRunAt(
    schedule: AutoSyncSchedule,
    timeZone: string,
    now: Date,
    previousScheduled: Date | null,
): Date {
    const t0 = previousScheduled && previousScheduled.getTime() > now.getTime() ? previousScheduled : now;

    if (schedule.intervalUnit === "hours") {
        return nextHourlyRunAt(schedule, timeZone, t0);
    }

    if (previousScheduled) {
        let candidate = instantAt(
            addLocalDays(localDateOf(previousScheduled, timeZone), schedule.intervalCount),
            schedule.runAtMinute,
            timeZone,
        );
        while (candidate.getTime() <= now.getTime()) {
            candidate = instantAt(
                addLocalDays(localDateOf(candidate, timeZone), schedule.intervalCount),
                schedule.runAtMinute,
                timeZone,
            );
        }
        return candidate;
    }

    const today = localDateOf(now, timeZone);
    const todayRun = instantAt(today, schedule.runAtMinute, timeZone);
    return todayRun.getTime() > now.getTime()
        ? todayRun
        : instantAt(addLocalDays(today, 1), schedule.runAtMinute, timeZone);
}

function nextHourlyRunAt(
    schedule: Extract<AutoSyncSchedule, { intervalUnit: "hours" }>,
    timeZone: string,
    t0: Date,
): Date {
    const intervalMinutes = schedule.intervalCount * 60;
    const runsPerDay = autoSyncRunsPerDay(schedule.windowStartMinute, schedule.windowEndMinute, schedule.intervalCount);
    const today = localDateOf(t0, timeZone);

    // Grids starting on D-1 cover a window that wraps past midnight; D+1 covers the first slot of the next day.
    let next: Date | null = null;
    for (const offset of [-1, 0, 1]) {
        const startDate = addLocalDays(today, offset);
        for (let k = 0; k < runsPerDay; k++) {
            const slot = instantAt(startDate, schedule.windowStartMinute + k * intervalMinutes, timeZone);
            if (slot.getTime() > t0.getTime() && (next === null || slot.getTime() < next.getTime())) {
                next = slot;
            }
        }
    }

    if (next === null) {
        throw new Error("No scheduled run found for auto-sync schedule");
    }
    return next;
}

/** Adds a uniform random offset of up to plus or minus AUTO_SYNC_JITTER_MS[unit] to a scheduled run. */
export function jitterRunAt(scheduled: Date, unit: AutoSyncIntervalUnit, random: () => number = Math.random): Date {
    return new Date(scheduled.getTime() + Math.round((random() * 2 - 1) * AUTO_SYNC_JITTER_MS[unit]));
}
