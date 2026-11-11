import { describe, expect, it } from "vitest";
import { AUTO_SYNC_PRESETS, formatAutoSyncInterval, formatMinuteOfDay, matchAutoSyncPreset } from "./autoSyncPresets";

describe("AUTO_SYNC_PRESETS", () => {
    it("labels each preset with the interval formatter's wording", () => {
        for (const preset of AUTO_SYNC_PRESETS) {
            expect(formatAutoSyncInterval(preset.intervalUnit, preset.intervalCount)).toBe(preset.label);
        }
    });

    it("lists the seven presets in order", () => {
        expect(AUTO_SYNC_PRESETS.map((p) => p.id)).toEqual(["1h", "2h", "4h", "12h", "1d", "3d", "7d"]);
    });
});

describe("matchAutoSyncPreset", () => {
    it("returns the preset whose unit and count match", () => {
        expect(matchAutoSyncPreset("hours", 4)).toBe("4h");
        expect(matchAutoSyncPreset("days", 1)).toBe("1d");
        expect(matchAutoSyncPreset("days", 7)).toBe("7d");
    });

    it("returns custom when no preset has the interval", () => {
        expect(matchAutoSyncPreset("hours", 5)).toBe("custom");
        expect(matchAutoSyncPreset("days", 2)).toBe("custom");
    });

    it("does not match a count under the other unit", () => {
        expect(matchAutoSyncPreset("days", 4)).toBe("custom");
    });
});

describe("formatAutoSyncInterval", () => {
    it.each([
        ["hours", 1, "Every hour"],
        ["hours", 4, "Every 4 hours"],
        ["days", 1, "Every day"],
        ["days", 5, "Every 5 days"],
        ["days", 7, "Every week"],
    ] as const)("formats %s x%i as %s", (unit, count, expected) => {
        expect(formatAutoSyncInterval(unit, count)).toBe(expected);
    });
});

describe("formatMinuteOfDay", () => {
    it.each([
        [0, "00:00"],
        [420, "07:00"],
        [1320, "22:00"],
        [1439, "23:59"],
    ])("formats minute %i as %s", (minute, expected) => {
        expect(formatMinuteOfDay(minute)).toBe(expected);
    });
});
