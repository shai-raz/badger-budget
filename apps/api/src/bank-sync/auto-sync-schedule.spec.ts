import {
    AUTO_SYNC_JITTER_MS,
    isValidTimeZone,
    jitterRunAt,
    nextScheduledRunAt,
    parseAutoSyncSchedule,
} from "./auto-sync-schedule";
import { autoSyncRunsPerDay, type AutoSyncSchedule } from "@badger/shared-data";

const JERUSALEM = "Asia/Jerusalem";

const hoursSchedule = (
    intervalCount: number,
    windowStartMinute: number,
    windowEndMinute: number,
): AutoSyncSchedule => ({
    intervalUnit: "hours",
    intervalCount,
    windowStartMinute,
    windowEndMinute,
});

const daysSchedule = (intervalCount: number, runAtMinute: number): AutoSyncSchedule => ({
    intervalUnit: "days",
    intervalCount,
    runAtMinute,
});

/** Chains nextScheduledRunAt from start, feeding each result back in as previousScheduled. */
function chain(schedule: AutoSyncSchedule, timeZone: string, start: Date, steps: number): Date[] {
    const runs: Date[] = [];
    let previous = start;
    for (let i = 0; i < steps; i++) {
        const next = nextScheduledRunAt(schedule, timeZone, previous, previous);
        runs.push(next);
        previous = next;
    }
    return runs;
}

const iso = (runs: Date[]) => runs.map((run) => run.toISOString());

describe("parseAutoSyncSchedule", () => {
    it("accepts an hourly window and returns the normalised model", () => {
        expect(
            parseAutoSyncSchedule({
                intervalUnit: "hours",
                intervalCount: 4,
                windowStartMinute: 420,
                windowEndMinute: 1320,
            }),
        ).toEqual({
            ok: true,
            schedule: { intervalUnit: "hours", intervalCount: 4, windowStartMinute: 420, windowEndMinute: 1320 },
        });
    });

    it("accepts a daily run time and returns the normalised model", () => {
        expect(parseAutoSyncSchedule({ intervalUnit: "days", intervalCount: 3, runAtMinute: 450 })).toEqual({
            ok: true,
            schedule: { intervalUnit: "days", intervalCount: 3, runAtMinute: 450 },
        });
    });

    it("rejects an unknown interval unit", () => {
        const result = parseAutoSyncSchedule({
            intervalUnit: "weeks" as unknown as "hours",
            intervalCount: 1,
            runAtMinute: 0,
        });
        expect(result).toEqual({ ok: false, message: "Choose hours or days." });
    });

    it("rejects an hourly count above 23 with the hours message", () => {
        expect(
            parseAutoSyncSchedule({
                intervalUnit: "hours",
                intervalCount: 24,
                windowStartMinute: 0,
                windowEndMinute: 60,
            }),
        ).toEqual({ ok: false, message: "Up to 23 hours. For more, use days." });
    });

    it("rejects a zero or non-integer hourly count", () => {
        for (const intervalCount of [0, 1.5]) {
            expect(
                parseAutoSyncSchedule({
                    intervalUnit: "hours",
                    intervalCount,
                    windowStartMinute: 0,
                    windowEndMinute: 60,
                }),
            ).toEqual({ ok: false, message: "Up to 23 hours. For more, use days." });
        }
    });

    it("rejects a daily count above 7", () => {
        expect(parseAutoSyncSchedule({ intervalUnit: "days", intervalCount: 8, runAtMinute: 0 })).toEqual({
            ok: false,
            message: "Up to 7 days.",
        });
    });

    it("rejects an hourly schedule missing either window minute", () => {
        const missing = { intervalUnit: "hours" as const, intervalCount: 4 };
        const message = "Hourly sync needs a start and end time.";
        expect(parseAutoSyncSchedule({ ...missing, windowStartMinute: 420 })).toEqual({ ok: false, message });
        expect(parseAutoSyncSchedule({ ...missing, windowEndMinute: 1320 })).toEqual({ ok: false, message });
        expect(parseAutoSyncSchedule({ ...missing, windowStartMinute: null, windowEndMinute: 1320 })).toEqual({
            ok: false,
            message,
        });
    });

    it("rejects window minutes outside 0 to 1439 or not whole", () => {
        const message = "Window times must be whole minutes from 0 to 1439.";
        const cases: Array<[number, number]> = [
            [-1, 600],
            [600, 1440],
            [420.5, 1320],
            [420, 1320.25],
        ];
        for (const [windowStartMinute, windowEndMinute] of cases) {
            expect(
                parseAutoSyncSchedule({ intervalUnit: "hours", intervalCount: 4, windowStartMinute, windowEndMinute }),
            ).toEqual({ ok: false, message });
        }
    });

    it("rejects an hourly window whose start equals its end", () => {
        expect(
            parseAutoSyncSchedule({
                intervalUnit: "hours",
                intervalCount: 4,
                windowStartMinute: 600,
                windowEndMinute: 600,
            }),
        ).toEqual({ ok: false, message: "Window start and end must differ." });
    });

    it("rejects an hourly schedule that also sets a run time", () => {
        expect(
            parseAutoSyncSchedule({
                intervalUnit: "hours",
                intervalCount: 4,
                windowStartMinute: 420,
                windowEndMinute: 1320,
                runAtMinute: 450,
            }),
        ).toEqual({ ok: false, message: "Hourly sync does not take a run time." });
    });

    it("rejects a daily schedule without a run time or with one outside the day", () => {
        const message = "Daily sync needs a run time from 0 to 1439.";
        expect(parseAutoSyncSchedule({ intervalUnit: "days", intervalCount: 1 })).toEqual({ ok: false, message });
        expect(parseAutoSyncSchedule({ intervalUnit: "days", intervalCount: 1, runAtMinute: null })).toEqual({
            ok: false,
            message,
        });
        expect(parseAutoSyncSchedule({ intervalUnit: "days", intervalCount: 1, runAtMinute: 1440 })).toEqual({
            ok: false,
            message,
        });
        expect(parseAutoSyncSchedule({ intervalUnit: "days", intervalCount: 1, runAtMinute: -5 })).toEqual({
            ok: false,
            message,
        });
    });

    it("rejects a daily schedule that also sets a window", () => {
        expect(
            parseAutoSyncSchedule({ intervalUnit: "days", intervalCount: 1, runAtMinute: 450, windowStartMinute: 420 }),
        ).toEqual({ ok: false, message: "Daily sync does not take a window." });
    });
});

describe("isValidTimeZone", () => {
    it("accepts a real IANA zone", () => {
        expect(isValidTimeZone(JERUSALEM)).toBe(true);
    });

    it("rejects an unknown zone", () => {
        expect(isValidTimeZone("Mars/Base")).toBe(false);
    });
});

describe("nextScheduledRunAt (hours)", () => {
    const schedule = hoursSchedule(4, 420, 1320);

    it("runs at 07:00 local when called at 06:00 local", () => {
        // 2026-11-11 is in Israel standard time (UTC+2), so 06:00 local is 04:00Z.
        const next = nextScheduledRunAt(schedule, JERUSALEM, new Date("2026-11-11T04:00:00Z"), null);
        expect(next.toISOString()).toBe("2026-11-11T05:00:00.000Z");
    });

    it("chains every four hours through the window and then restarts the next morning", () => {
        const runs = chain(schedule, JERUSALEM, new Date("2026-11-11T05:00:00Z"), 8);
        expect(iso(runs)).toEqual([
            "2026-11-11T09:00:00.000Z", // 11:00 local
            "2026-11-11T13:00:00.000Z", // 15:00 local
            "2026-11-11T17:00:00.000Z", // 19:00 local
            "2026-11-12T05:00:00.000Z", // 07:00 local next day
            "2026-11-12T09:00:00.000Z",
            "2026-11-12T13:00:00.000Z",
            "2026-11-12T17:00:00.000Z",
            "2026-11-13T05:00:00.000Z",
        ]);
    });

    it("never lands outside the window over three days", () => {
        const runs = chain(schedule, JERUSALEM, new Date("2026-11-11T05:00:00Z"), 12);
        expect(iso(runs)).toEqual([
            "2026-11-11T09:00:00.000Z",
            "2026-11-11T13:00:00.000Z",
            "2026-11-11T17:00:00.000Z",
            "2026-11-12T05:00:00.000Z",
            "2026-11-12T09:00:00.000Z",
            "2026-11-12T13:00:00.000Z",
            "2026-11-12T17:00:00.000Z",
            "2026-11-13T05:00:00.000Z",
            "2026-11-13T09:00:00.000Z",
            "2026-11-13T13:00:00.000Z",
            "2026-11-13T17:00:00.000Z",
            "2026-11-14T05:00:00.000Z",
        ]);
    });

    it("hourly 07:00 to 22:00 yields 16 slots per day, matching autoSyncRunsPerDay", () => {
        expect(autoSyncRunsPerDay(420, 1320, 1)).toBe(16);

        const runs = chain(hoursSchedule(1, 420, 1320), JERUSALEM, new Date("2026-11-11T04:00:00Z"), 16);
        expect(runs[0].toISOString()).toBe("2026-11-11T05:00:00.000Z");
        expect(runs[15].toISOString()).toBe("2026-11-11T20:00:00.000Z"); // 22:00 local, inclusive end
        expect(chain(hoursSchedule(1, 420, 1320), JERUSALEM, runs[15], 1)[0].toISOString()).toBe(
            "2026-11-12T05:00:00.000Z",
        );
    });

    it("handles a window that wraps past midnight", () => {
        // 22:00 to 02:00 every 2 hours, Israel standard time (UTC+2): 22:00, 00:00 and 02:00 local.
        const runs = chain(hoursSchedule(2, 1320, 120), JERUSALEM, new Date("2026-11-11T18:00:00Z"), 4);
        expect(iso(runs)).toEqual([
            "2026-11-11T20:00:00.000Z", // 22:00 local
            "2026-11-11T22:00:00.000Z", // 00:00 local on the 12th
            "2026-11-12T00:00:00.000Z", // 02:00 local on the 12th
            "2026-11-12T20:00:00.000Z", // 22:00 local on the 12th
        ]);
    });

    it("keeps wall-clock times across the New York spring-forward change", () => {
        // Spring forward 2026-03-08 (EST to EDT at 02:00 local).
        const runs = chain(hoursSchedule(4, 420, 1320), "America/New_York", new Date("2026-03-07T12:00:00Z"), 7);
        expect(iso(runs)).toEqual([
            "2026-03-07T16:00:00.000Z", // 11:00 EST
            "2026-03-07T20:00:00.000Z", // 15:00 EST
            "2026-03-08T00:00:00.000Z", // 19:00 EST
            "2026-03-08T11:00:00.000Z", // 07:00 EDT
            "2026-03-08T15:00:00.000Z", // 11:00 EDT
            "2026-03-08T19:00:00.000Z", // 15:00 EDT
            "2026-03-08T23:00:00.000Z", // 19:00 EDT
        ]);
    });

    it("keeps wall-clock times across the New York fall-back change", () => {
        // Fall back 2026-11-01 (EDT to EST at 02:00 local).
        const runs = chain(hoursSchedule(4, 420, 1320), "America/New_York", new Date("2026-10-31T23:00:00Z"), 5);
        expect(iso(runs)).toEqual([
            "2026-11-01T12:00:00.000Z", // 07:00 EST
            "2026-11-01T16:00:00.000Z", // 11:00 EST
            "2026-11-01T20:00:00.000Z", // 15:00 EST
            "2026-11-02T00:00:00.000Z", // 19:00 EST
            "2026-11-02T12:00:00.000Z", // 07:00 EST
        ]);
    });

    it("rolls a previous run far in the past forward to the next slot after now", () => {
        const next = nextScheduledRunAt(
            hoursSchedule(4, 420, 1320),
            JERUSALEM,
            new Date("2026-11-11T06:00:00Z"),
            new Date("2026-01-01T00:00:00Z"),
        );
        expect(next.toISOString()).toBe("2026-11-11T09:00:00.000Z"); // 11:00 local
    });
});

describe("nextScheduledRunAt (days)", () => {
    it("runs today at the configured time when that is still ahead", () => {
        // 2026-11-11 04:00Z is 06:00 local; the 07:30 run is still ahead today.
        const next = nextScheduledRunAt(daysSchedule(1, 450), JERUSALEM, new Date("2026-11-11T04:00:00Z"), null);
        expect(next.toISOString()).toBe("2026-11-11T05:30:00.000Z");
    });

    it("runs tomorrow at the configured time when today has already passed", () => {
        // 2026-11-11 06:00Z is 08:00 local, past 07:30.
        const next = nextScheduledRunAt(daysSchedule(1, 450), JERUSALEM, new Date("2026-11-11T06:00:00Z"), null);
        expect(next.toISOString()).toBe("2026-11-12T05:30:00.000Z");
    });

    it("rolls a previous run far in the past forward past now, keeping the interval and local time", () => {
        // Every 2 days from 2026-11-01 07:30 local: 3rd, 5th, 7th, 9th, 11th (already passed at 08:00 local), so 13th.
        const next = nextScheduledRunAt(
            daysSchedule(2, 450),
            JERUSALEM,
            new Date("2026-11-11T06:00:00Z"),
            new Date("2026-11-01T05:30:00Z"),
        );
        expect(next.toISOString()).toBe("2026-11-13T05:30:00.000Z");
    });

    it("chains every three days at 07:30 Europe/London across the late-March DST change", () => {
        // GMT until 2026-03-29, then BST (UTC+1). Each run keeps 07:30 local and advances three local days.
        const runs = chain(daysSchedule(3, 450), "Europe/London", new Date("2026-03-25T07:30:00Z"), 5);
        expect(iso(runs)).toEqual([
            "2026-03-28T07:30:00.000Z", // GMT
            "2026-03-31T06:30:00.000Z", // BST
            "2026-04-03T06:30:00.000Z",
            "2026-04-06T06:30:00.000Z",
            "2026-04-09T06:30:00.000Z",
        ]);
    });
});

describe("jitterRunAt", () => {
    const scheduled = new Date("2026-11-11T12:00:00Z");

    it("applies the full negative offset at random = 0 and the full positive offset at random = 1", () => {
        for (const unit of ["hours", "days"] as const) {
            const width = AUTO_SYNC_JITTER_MS[unit];
            expect(jitterRunAt(scheduled, unit, () => 0).getTime()).toBe(scheduled.getTime() - width);
            expect(jitterRunAt(scheduled, unit, () => 1).getTime()).toBe(scheduled.getTime() + width);
        }
    });

    it("leaves the scheduled run unchanged at random = 0.5", () => {
        for (const unit of ["hours", "days"] as const) {
            expect(jitterRunAt(scheduled, unit, () => 0.5).getTime()).toBe(scheduled.getTime());
        }
    });

    it("uses a five minute width for hours and a twenty minute width for days", () => {
        expect(AUTO_SYNC_JITTER_MS).toEqual({ hours: 5 * 60_000, days: 20 * 60_000 });
    });
});
