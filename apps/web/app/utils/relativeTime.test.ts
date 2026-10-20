import { describe, expect, it } from "vitest";
import { calendarDaysUntil, formatTimeAgo, formatTimeAgoCompact, isStale } from "./relativeTime";

const NOW = new Date("2026-06-15T12:00:00");

describe("formatTimeAgo", () => {
    it("is 'just now' under a minute", () => {
        expect(formatTimeAgo(new Date(NOW.getTime() - 59 * 1000), NOW)).toBe("just now");
    });

    it("counts minutes up to 59", () => {
        expect(formatTimeAgo(new Date(NOW.getTime() - 59 * 60 * 1000), NOW)).toBe("59 min ago");
    });

    it("switches to hours at 60 minutes", () => {
        expect(formatTimeAgo(new Date(NOW.getTime() - 60 * 60 * 1000), NOW)).toBe("1 hour ago");
    });

    it("pluralizes hours and holds through 23h59m", () => {
        expect(formatTimeAgo(new Date(NOW.getTime() - 2 * 60 * 60 * 1000), NOW)).toBe("2 hours ago");
        expect(formatTimeAgo(new Date(NOW.getTime() - (23 * 60 + 59) * 60 * 1000), NOW)).toBe("23 hours ago");
    });

    it("switches to days at 24 hours", () => {
        expect(formatTimeAgo(new Date(NOW.getTime() - 24 * 60 * 60 * 1000), NOW)).toBe("1 day ago");
    });

    it("pluralizes and floors days", () => {
        expect(formatTimeAgo(new Date(NOW.getTime() - 3 * 24 * 60 * 60 * 1000), NOW)).toBe("3 days ago");
        expect(formatTimeAgo(new Date(NOW.getTime() - (3 * 24 * 60 * 60 * 1000 + 60 * 60 * 1000)), NOW)).toBe(
            "3 days ago",
        );
    });

    it("accepts an ISO string", () => {
        expect(formatTimeAgo(NOW.toISOString(), NOW)).toBe("just now");
    });
});

describe("formatTimeAgoCompact", () => {
    it("is 'now' under a minute", () => {
        expect(formatTimeAgoCompact(new Date(NOW.getTime() - 30 * 1000), NOW)).toBe("now");
    });

    it("formats minutes, hours and days compactly", () => {
        expect(formatTimeAgoCompact(new Date(NOW.getTime() - 5 * 60 * 1000), NOW)).toBe("5m ago");
        expect(formatTimeAgoCompact(new Date(NOW.getTime() - 5 * 60 * 60 * 1000), NOW)).toBe("5h ago");
        expect(formatTimeAgoCompact(new Date(NOW.getTime() - 5 * 24 * 60 * 60 * 1000), NOW)).toBe("5d ago");
    });
});

describe("isStale", () => {
    it("is not stale exactly at the threshold", () => {
        expect(isStale(new Date(NOW.getTime() - 3 * 24 * 60 * 60 * 1000), NOW)).toBe(false);
    });

    it("is stale one millisecond past the threshold", () => {
        expect(isStale(new Date(NOW.getTime() - (3 * 24 * 60 * 60 * 1000 + 1)), NOW)).toBe(true);
    });

    it("honors a custom threshold", () => {
        const oneDayAgo = new Date(NOW.getTime() - 24 * 60 * 60 * 1000);
        expect(isStale(oneDayAgo, NOW, 1)).toBe(false);
        expect(isStale(oneDayAgo, NOW, 0)).toBe(true);
    });
});

describe("calendarDaysUntil", () => {
    it("is 0 for today, 1 for tomorrow, -1 for yesterday", () => {
        expect(calendarDaysUntil(new Date("2026-06-15T01:00:00"), NOW)).toBe(0);
        expect(calendarDaysUntil(new Date("2026-06-16T23:00:00"), NOW)).toBe(1);
        expect(calendarDaysUntil(new Date("2026-06-14T00:00:00"), NOW)).toBe(-1);
    });

    it("counts one day across a US spring-forward DST transition", () => {
        // 2026-03-08 is the US spring-forward date; the local day is 23h long.
        const beforeDst = new Date("2026-03-07T12:00:00");
        const afterDst = new Date("2026-03-08T12:00:00");
        expect(calendarDaysUntil(afterDst, beforeDst)).toBe(1);
    });

    it("counts one day across a US fall-back DST transition", () => {
        // 2026-11-01 is the US fall-back date; the local day is 25h long.
        const beforeDst = new Date("2026-10-31T12:00:00");
        const afterDst = new Date("2026-11-01T12:00:00");
        expect(calendarDaysUntil(afterDst, beforeDst)).toBe(1);
    });
});
