import { describe, expect, it } from "vitest";
import { latestSyncedAt } from "./lastSynced";

describe("latestSyncedAt", () => {
    it("is null for undefined, null or empty connections", () => {
        expect(latestSyncedAt(undefined)).toBeNull();
        expect(latestSyncedAt(null)).toBeNull();
        expect(latestSyncedAt([])).toBeNull();
    });

    it("is null when no connection has synced", () => {
        expect(latestSyncedAt([{ lastSyncedAt: null }, { lastSyncedAt: null }])).toBeNull();
    });

    it("picks the latest timestamp across mixed string and Date values", () => {
        const result = latestSyncedAt([
            { lastSyncedAt: "2026-06-10T08:00:00.000Z" },
            { lastSyncedAt: null },
            { lastSyncedAt: new Date("2026-06-12T09:30:00.000Z") },
            { lastSyncedAt: "2026-06-11T23:00:00.000Z" },
        ]);

        expect(result).toEqual(new Date("2026-06-12T09:30:00.000Z"));
    });

    it("returns a single synced connection's timestamp", () => {
        expect(latestSyncedAt([{ lastSyncedAt: "2026-06-01T00:00:00.000Z" }])).toEqual(
            new Date("2026-06-01T00:00:00.000Z"),
        );
    });
});
