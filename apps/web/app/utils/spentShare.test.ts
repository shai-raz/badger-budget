import { describe, expect, it } from "vitest";
import { spentShare } from "./spentShare";

describe("spentShare", () => {
    it("reports the share of income spent, rounded to a whole percent", () => {
        expect(spentShare(1000, 425)).toEqual({
            short: "43% spent",
            caption: "43% of income spent",
            fillPercent: 43,
        });
    });

    it("can report exactly 100% when spending matches income", () => {
        expect(spentShare(500, 500)).toEqual({
            short: "100% spent",
            caption: "100% of income spent",
            fillPercent: 100,
        });
    });

    it("keeps the label above 100% but caps the bar at full", () => {
        expect(spentShare(200, 500)).toEqual({
            short: "250% spent",
            caption: "250% of income spent",
            fillPercent: 100,
        });
    });

    it("reads spending with no income as no income, with a full bar", () => {
        expect(spentShare(0, 120)).toEqual({
            short: "no income",
            caption: "Spending with no income",
            fillPercent: 100,
        });
    });

    it("reads no income and no spending as an empty bar", () => {
        expect(spentShare(0, 0)).toEqual({
            short: "0% spent",
            caption: "Nothing spent yet",
            fillPercent: 0,
        });
    });

    it("reads zero spending against real income as 0%", () => {
        expect(spentShare(800, 0)).toEqual({
            short: "0% spent",
            caption: "0% of income spent",
            fillPercent: 0,
        });
    });
});
