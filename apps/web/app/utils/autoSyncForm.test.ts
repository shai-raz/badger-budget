import { describe, expect, it } from "vitest";
import { DEFAULT_AUTO_SYNC_SCHEDULE } from "@badger/shared-data";
import type { IAutoSyncStatus } from "@badger/types";
import {
    dateToMinute,
    expiringDaysLeft,
    firstAllowedDuration,
    firstSyncLabel,
    intervalCountError,
    lastSyncDayLabel,
    minuteToDate,
    nextOccurrence,
    scheduleFromStatus,
    scheduleWindowLabel,
    syncDayLabel,
} from "./autoSyncForm";

// Local-time dates keep these tests the same in every time zone.
const NOON = new Date(2026, 10, 12, 12, 0);

const status = (overrides: Partial<IAutoSyncStatus>): IAutoSyncStatus =>
    ({
        id: "grant-1",
        intervalUnit: "hours",
        intervalCount: 4,
        windowStartMinute: 420,
        windowEndMinute: 1320,
        runAtMinute: null,
        timeZone: "Europe/London",
        deviceLabel: "Chrome on Windows",
        durationDays: 30,
        expiresAt: "2026-12-12T00:00:00.000Z",
        nextRunAt: "2026-11-12T13:00:00.000Z",
        lastRunAt: null,
        missedRuns: 0,
        unreachable: false,
        createdAt: "2026-11-12T00:00:00.000Z",
        includedConnections: [],
        notIncludedConnections: [],
        ...overrides,
    }) as IAutoSyncStatus;

describe("time of day", () => {
    it("round-trips minutes of the day through a local Date", () => {
        expect(dateToMinute(minuteToDate(1320, NOON))).toBe(1320);
        expect(minuteToDate(420, NOON).getHours()).toBe(7);
    });

    it("picks today when the time is still ahead, else tomorrow", () => {
        const ahead = nextOccurrence(1320, NOON);
        expect(ahead.getDate()).toBe(12);
        const passed = nextOccurrence(420, NOON);
        expect(passed.getDate()).toBe(13);
        expect(passed.getHours()).toBe(7);
    });
});

describe("sync day labels", () => {
    it("says today or tomorrow for the next two days", () => {
        expect(syncDayLabel(new Date(2026, 10, 12, 20, 0), NOON)).toBe("today");
        expect(syncDayLabel(new Date(2026, 10, 13, 7, 0), NOON)).toBe("tomorrow");
    });

    it("gives a short date further out", () => {
        expect(syncDayLabel(new Date(2026, 10, 20, 7, 0), NOON)).toMatch(/Nov/);
    });

    it("formats the first sync as day and time", () => {
        expect(firstSyncLabel(1320, NOON)).toBe("today at 22:00");
        expect(firstSyncLabel(420, NOON)).toBe("tomorrow at 07:00");
    });
});

describe("schedule from status", () => {
    it("reads an hourly window", () => {
        expect(scheduleFromStatus(status({}))).toEqual({
            intervalUnit: "hours",
            intervalCount: 4,
            windowStartMinute: 420,
            windowEndMinute: 1320,
        });
        expect(scheduleWindowLabel(scheduleFromStatus(status({})))).toBe("07:00–22:00");
    });

    it("reads a daily run time", () => {
        const daily = status({
            intervalUnit: "days",
            intervalCount: 3,
            windowStartMinute: null,
            windowEndMinute: null,
            runAtMinute: 480,
        });
        expect(scheduleFromStatus(daily)).toEqual({ intervalUnit: "days", intervalCount: 3, runAtMinute: 480 });
        expect(scheduleWindowLabel(scheduleFromStatus(daily))).toBe("at 08:00");
    });

    it("falls back to the default when a field is missing", () => {
        const broken = status({ windowStartMinute: null });
        expect(scheduleFromStatus(broken)).toBe(DEFAULT_AUTO_SYNC_SCHEDULE);
    });
});

describe("interval count errors", () => {
    it("accepts 1 to 23 hours and 1 to 7 days", () => {
        expect(intervalCountError("hours", 1)).toBeNull();
        expect(intervalCountError("hours", 23)).toBeNull();
        expect(intervalCountError("days", 7)).toBeNull();
    });

    it("explains the hour limit and points to days", () => {
        expect(intervalCountError("hours", 24)).toBe("Up to 23 hours. For more, use days.");
    });

    it("rejects an empty, fractional or too small count", () => {
        expect(intervalCountError("hours", null)).toBe("Enter a whole number.");
        expect(intervalCountError("days", 1.5)).toBe("Enter a whole number.");
        expect(intervalCountError("days", 0)).toBe("At least 1.");
        expect(intervalCountError("days", 8)).toBe("Up to 7 days.");
    });
});

describe("firstAllowedDuration", () => {
    it("keeps a duration that covers two intervals", () => {
        expect(firstAllowedDuration(7, "hours", 4)).toBe(7);
        expect(firstAllowedDuration(30, "days", 7)).toBe(30);
    });

    it("moves to the shortest duration that covers two intervals", () => {
        expect(firstAllowedDuration(7, "days", 5)).toBe(30);
        expect(firstAllowedDuration(7, "days", 7)).toBe(30);
    });
});

describe("expiringDaysLeft", () => {
    const now = new Date("2026-11-12T10:00:00Z");
    const daysFrom = (days: number) => new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString();

    it("is null while the grant has more than three days left", () => {
        expect(expiringDaysLeft(daysFrom(3.5), now)).toBeNull();
        expect(expiringDaysLeft(daysFrom(30), now)).toBeNull();
    });

    it("counts the days left, rounding a part day up", () => {
        expect(expiringDaysLeft(daysFrom(3), now)).toBe(3);
        expect(expiringDaysLeft(daysFrom(2.5), now)).toBe(3);
        expect(expiringDaysLeft(daysFrom(1), now)).toBe(1);
    });

    it("never reports fewer than one day once it is due", () => {
        expect(expiringDaysLeft(daysFrom(-1), now)).toBe(1);
    });
});

describe("lastSyncDayLabel", () => {
    const now = new Date(2026, 10, 12, 10, 0);

    it("names today, yesterday, or a short date", () => {
        expect(lastSyncDayLabel(new Date(2026, 10, 12, 1, 0), now)).toBe("today");
        expect(lastSyncDayLabel(new Date(2026, 10, 11, 23, 0), now)).toBe("yesterday");
        expect(lastSyncDayLabel(new Date(2026, 10, 9, 12, 0), now)).toBe("Mon, Nov 9");
    });
});
