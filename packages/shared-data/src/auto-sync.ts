// Automatic bank sync: the shared schedule model, limits and token TTL. Presets are UI-only and live in apps/web.

export const AUTO_SYNC_DURATIONS = [7, 30, 90] as const;
export type AutoSyncDurationDays = (typeof AUTO_SYNC_DURATIONS)[number];
export const DEFAULT_AUTO_SYNC_DURATION_DAYS: AutoSyncDurationDays = 30;

export function isAutoSyncDurationDays(value: unknown): value is AutoSyncDurationDays {
    return typeof value === "number" && (AUTO_SYNC_DURATIONS as readonly number[]).includes(value);
}

export const AUTO_SYNC_INTERVAL_UNITS = ["hours", "days"] as const;
export type AutoSyncIntervalUnit = (typeof AUTO_SYNC_INTERVAL_UNITS)[number];

export function isAutoSyncIntervalUnit(value: unknown): value is AutoSyncIntervalUnit {
    return typeof value === "string" && (AUTO_SYNC_INTERVAL_UNITS as readonly string[]).includes(value);
}

export const AUTO_SYNC_INTERVAL_LIMITS: Readonly<Record<AutoSyncIntervalUnit, { min: number; max: number }>> = {
    hours: { min: 1, max: 23 },
    days: { min: 1, max: 7 },
};

/** Minutes of the local day are 0–1439. */
export const AUTO_SYNC_MAX_MINUTE = 1439;

export type AutoSyncSchedule =
    | { intervalUnit: "hours"; intervalCount: number; windowStartMinute: number; windowEndMinute: number }
    | { intervalUnit: "days"; intervalCount: number; runAtMinute: number };

/** Every 4 hours, 07:00–22:00. */
export const DEFAULT_AUTO_SYNC_SCHEDULE: AutoSyncSchedule = {
    intervalUnit: "hours",
    intervalCount: 4,
    windowStartMinute: 420,
    windowEndMinute: 1320,
};

export function autoSyncIntervalMs(unit: AutoSyncIntervalUnit, count: number): number {
    return unit === "hours" ? count * 3_600_000 : count * 86_400_000;
}

/** The grant duration ("Keep on for") must cover at least two intervals (AC23). */
export function isAutoSyncDurationAllowed(
    durationDays: AutoSyncDurationDays,
    unit: AutoSyncIntervalUnit,
    count: number,
): boolean {
    return durationDays * 86_400_000 >= 2 * autoSyncIntervalMs(unit, count);
}

/** Window length in minutes; a window may wrap past midnight, and start === end gives 0. */
export function autoSyncWindowLengthMinutes(startMinute: number, endMinute: number): number {
    return (endMinute - startMinute + 1440) % 1440;
}

/** Runs per day for an hourly schedule; the end minute is inclusive. */
export function autoSyncRunsPerDay(startMinute: number, endMinute: number, intervalHours: number): number {
    return Math.floor(autoSyncWindowLengthMinutes(startMinute, endMinute) / (intervalHours * 60)) + 1;
}

export const AUTO_SYNC_RUN_TOKEN_MAX_TTL_MS = 6 * 3_600_000;

export function autoSyncRunTokenTtlMs(unit: AutoSyncIntervalUnit, count: number): number {
    return Math.min(AUTO_SYNC_RUN_TOKEN_MAX_TTL_MS, autoSyncIntervalMs(unit, count));
}

export const AUTO_SYNC_KEY_BYTES = 32;
