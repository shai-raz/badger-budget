import type { ITransactionsSummaryResponse } from "@badger/types";
import { describe, expect, it } from "vitest";
import { mountSuspended } from "@nuxt/test-utils/runtime";
import TotalsCard from "./TotalsCard.vue";

const summary: ITransactionsSummaryResponse = {
    income: 1000,
    expenses: 430,
    net: 570,
    transferred: 120,
    available: 450,
    count: 5,
    currencyCode: "USD",
};

describe("TransactionsTotalsCard", () => {
    it("shows Net, Available, Income, Expenses and Transferred at full precision", async () => {
        const wrapper = await mountSuspended(TotalsCard, { props: { summary } });

        const text = wrapper.text();
        expect(text).toContain("+$570.00");
        expect(text).toContain("+$450.00");
        expect(text).toContain("+$1,000.00");
        expect(text).toContain("-$430.00");
        expect(text).toContain("$120.00");
    });

    it("labels the five figures", async () => {
        const wrapper = await mountSuspended(TotalsCard, { props: { summary } });

        const text = wrapper.text();
        for (const label of ["Net", "Available", "Income", "Expenses", "Transferred"]) {
            expect(text).toContain(label);
        }
    });

    it("summarises spending as a share of income beside the bar", async () => {
        const wrapper = await mountSuspended(TotalsCard, { props: { summary } });

        expect(wrapper.text()).toContain("43% spent");
        const bar = wrapper.find('[role="img"]');
        expect(bar.attributes("aria-label")).toBe("43% of income spent");
        expect(wrapper.find('[role="img"] > div').attributes("style")).toContain("width: 43%");
    });

    it("shows a dash in place of each figure when there is no summary", async () => {
        const wrapper = await mountSuspended(TotalsCard, { props: {} });

        expect(wrapper.text()).not.toContain("$");
        expect(wrapper.findAll("span").filter((span) => span.text() === "\u2014").length).toBe(6);
        expect(wrapper.text()).toContain("\u2014");
    });

    it("shows skeleton placeholders instead of values while loading", async () => {
        const wrapper = await mountSuspended(TotalsCard, { props: { summary, loading: true } });

        expect(wrapper.findAll(".p-skeleton").length).toBeGreaterThan(0);
        expect(wrapper.text()).not.toContain("$570.00");
    });
});
