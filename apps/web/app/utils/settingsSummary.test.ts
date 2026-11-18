import { describe, expect, it } from "vitest";
import { connectedAppsLabel, countLabel } from "./settingsSummary";

describe("countLabel", () => {
    it("uses the singular for exactly one", () => {
        expect(countLabel(1, "rule")).toBe("1 rule");
    });

    it("uses the plural for zero and many", () => {
        expect(countLabel(0, "rule")).toBe("0 rules");
        expect(countLabel(14, "rule")).toBe("14 rules");
    });

    it("uses an explicit irregular plural", () => {
        expect(countLabel(1, "category", "categories")).toBe("1 category");
        expect(countLabel(14, "category", "categories")).toBe("14 categories");
    });
});

describe("connectedAppsLabel", () => {
    it("says no apps are connected when the list is empty", () => {
        expect(connectedAppsLabel([])).toBe("No apps connected");
    });

    it("names a single app in the singular", () => {
        expect(connectedAppsLabel(["Claude"])).toBe("1 app connected · Claude");
    });

    it("lists several apps in the plural, in order", () => {
        expect(connectedAppsLabel(["Claude", "ChatGPT"])).toBe("2 apps connected · Claude, ChatGPT");
    });
});
