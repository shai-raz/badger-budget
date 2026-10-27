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
    refetch: null as unknown as () => void,
}));

vi.mock("~/composables/reports/useMonthlySpending", async () => {
    const { ref } = await import("vue");
    return {
        useMonthlySpending: () => ({
            totals: ref(mockState.totals),
            firstMonth: ref("2024-01"),
            currency: ref({ code: "USD", symbol: "$" }),
            error: ref(mockState.error),
            refetch: mockState.refetch,
        }),
    };
});

mockNuxtImport("useIsDesktop", () => () => ref(true));

const OCT_2026: MonthRange = { kind: "range", from: "2026-10", to: "2026-10" };

const mounted: { unmount: () => void }[] = [];

const mountCard = async (now: Date = NOW) => {
    const wrapper = await mountSuspended(MonthlySpendingCard, { props: { modelValue: OCT_2026, now } });
    mounted.push(wrapper);
    return wrapper;
};

describe("MonthlySpendingCard", () => {
    beforeEach(() => {
        vi.useFakeTimers({ toFake: ["Date"] });
        vi.setSystemTime(NOW);
        mockState.totals = { "2026-09": 1380, "2026-10": 900 };
        mockState.error = null;
        mockState.refetch = vi.fn();
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

    it("offers a retry for the failed pages when a page fails but other months have loaded", async () => {
        mockState.error = new Error("boom");
        const wrapper = await mountCard();

        const alert = wrapper.find('[role="alert"]');
        expect(alert.text()).toContain("Couldn't load some months.");

        await alert.find("button").trigger("click");
        expect(mockState.refetch).toHaveBeenCalledTimes(1);
    });

    it("shows no retry message when every page has loaded", async () => {
        const wrapper = await mountCard();

        expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    });

    it("follows the page's clock into a new month", async () => {
        mockState.totals = { ...mockState.totals, "2026-11": 300 };
        const wrapper = await mountCard(new Date(2026, 9, 31));
        const NOV_2026: MonthRange = { kind: "range", from: "2026-11", to: "2026-11" };

        await wrapper.setProps({ now: new Date(2026, 10, 1), modelValue: NOV_2026 });

        expect(wrapper.find('[data-month="2026-11"] button').exists()).toBe(true);
    });
});
