import { afterEach, describe, expect, it, vi } from "vitest";
import { mountSuspended } from "@nuxt/test-utils/runtime";
import { nextTick } from "vue";
import type { IScraperConnectionResponse } from "@badger/types";
import ConnectionSubtitle from "./ConnectionSubtitle.vue";

const NOW = new Date("2026-11-03T12:00:00Z");
const hoursBefore = (hours: number) => new Date(NOW.getTime() - hours * 60 * 60 * 1000);
const daysBefore = (days: number) => new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);

const connection = (
    overrides: Partial<Pick<IScraperConnectionResponse, "companyId" | "lastSyncedAt">>,
): Pick<IScraperConnectionResponse, "companyId" | "lastSyncedAt"> => ({
    companyId: "visaCal",
    lastSyncedAt: null,
    ...overrides,
});

const text = (wrapper: { text: () => string }) => wrapper.text().replace(/\s+/g, " ").trim();

describe("ConnectionSubtitle", () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it("reads provider and compact sync age for a recent sync", async () => {
        vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
        vi.setSystemTime(NOW);
        const wrapper = await mountSuspended(ConnectionSubtitle, {
            props: { connection: connection({ lastSyncedAt: hoursBefore(3) }) },
        });

        expect(text(wrapper)).toBe("Visa Cal · Synced 3h ago");
        expect(wrapper.find(".text-amber-600").exists()).toBe(false);
        expect(wrapper.find(".pi-exclamation-circle").exists()).toBe(false);
    });

    it("marks a sync older than three days amber with an aria-hidden icon", async () => {
        vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
        vi.setSystemTime(NOW);
        const wrapper = await mountSuspended(ConnectionSubtitle, {
            props: { connection: connection({ lastSyncedAt: daysBefore(5) }) },
        });

        expect(text(wrapper)).toBe("Visa Cal · Synced 5d ago");
        const amber = wrapper.find("span.text-amber-600");
        expect(amber.exists()).toBe(true);
        const icon = amber.find("i.pi-exclamation-circle");
        expect(icon.exists()).toBe(true);
        expect(icon.attributes("aria-hidden")).toBe("true");
    });

    it("shows never synced without amber", async () => {
        vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
        vi.setSystemTime(NOW);
        const wrapper = await mountSuspended(ConnectionSubtitle, {
            props: { connection: connection({ lastSyncedAt: null }) },
        });

        expect(text(wrapper)).toBe("Visa Cal · Never synced");
        expect(wrapper.find(".text-amber-600").exists()).toBe(false);
        expect(wrapper.find(".pi-exclamation-circle").exists()).toBe(false);
    });

    it("keeps the sync age current as time passes", async () => {
        vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
        vi.setSystemTime(NOW);
        const wrapper = await mountSuspended(ConnectionSubtitle, {
            props: { connection: connection({ lastSyncedAt: NOW }) },
        });

        expect(text(wrapper)).toBe("Visa Cal · Synced now");

        vi.advanceTimersByTime(60_000);
        await nextTick();

        expect(text(wrapper)).toBe("Visa Cal · Synced 1m ago");
    });
});
