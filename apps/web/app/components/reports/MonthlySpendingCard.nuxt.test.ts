import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockNuxtImport, mountSuspended } from "@nuxt/test-utils/runtime";
import { ref } from "vue";
import MonthlySpendingCard from "./MonthlySpendingCard.vue";
import type { MonthRange } from "~/utils/monthRange";

// Oct 26 2026: the current month is Oct 2026.
const NOW = new Date(2026, 9, 26);

const mockState = vi.hoisted(() => ({
    totals: {} as Record<string, number>,
    error: null as unknown,
}));

vi.mock("~/composables/reports/useMonthlySpending", async () => {
    const { ref } = await import("vue");
    return {
        useMonthlySpending: () => ({
            totals: ref(mockState.totals),
            firstMonth: ref("2024-01"),
            currency: ref({ code: "USD", symbol: "$" }),
            error: ref(mockState.error),
            refetch: () => {},
        }),
    };
});

mockNuxtImport("useIsDesktop", () => () => ref(true));

const OCT_2026: MonthRange = { kind: "range", from: "2026-10", to: "2026-10" };

const mounted: { unmount: () => void }[] = [];

const mountCard = async () => {
    const wrapper = await mountSuspended(MonthlySpendingCard, { props: { modelValue: OCT_2026 } });
    mounted.push(wrapper);
    return wrapper;
};

describe("MonthlySpendingCard", () => {
    beforeEach(() => {
        vi.useFakeTimers({ toFake: ["Date"] });
        vi.setSystemTime(NOW);
        mockState.totals = { "2026-09": 1380, "2026-10": 900 };
        mockState.error = null;
    });

    afterEach(() => {
        mounted.splice(0).forEach((wrapper) => wrapper.unmount());
        vi.useRealTimers();
    });

    it("shows the strip in a band titled Monthly spending with a bar per month", async () => {
        const wrapper = await mountCard();

        expect(wrapper.text()).toContain("Monthly spending");
        expect(wrapper.find('[data-month="2026-10"] button').exists()).toBe(true);
        expect(wrapper.find('[data-month="2026-10"] button').attributes("aria-label")).toContain("$900.00");
    });

    it("shows its error in the band and no strip when no month has loaded", async () => {
        mockState.totals = {};
        mockState.error = new Error("boom");
        const wrapper = await mountCard();

        expect(wrapper.text()).toContain("Couldn't load monthly spending.");
        expect(wrapper.find("[data-month]").exists()).toBe(false);
    });

    it("keeps the strip when a page fails but other months have loaded", async () => {
        mockState.error = new Error("boom");
        const wrapper = await mountCard();

        expect(wrapper.text()).not.toContain("Couldn't load monthly spending.");
        expect(wrapper.find('[data-month="2026-10"]').exists()).toBe(true);
    });
});
