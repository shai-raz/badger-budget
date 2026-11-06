import { describe, expect, it } from "vitest";
import { FILTER_COPY, filterSelectionLabel } from "./filterLabels";

describe("filterSelectionLabel", () => {
    it("is null when nothing is selected", () => {
        expect(filterSelectionLabel("accounts", [])).toBeNull();
        expect(filterSelectionLabel("types", [])).toBeNull();
    });

    it("names a single selected account by its label", () => {
        expect(filterSelectionLabel("accounts", [{ label: "Leumi checking" }])).toBe("Leumi checking");
    });

    it("counts several accounts", () => {
        const selected = [{ label: "Leumi" }, { label: "Visa" }, { label: "Wallet" }];

        expect(filterSelectionLabel("accounts", selected)).toBe("3 accounts");
    });

    it("counts several categories", () => {
        expect(filterSelectionLabel("categories", [{ label: "Groceries" }, { label: "Rent" }])).toBe("2 categories");
    });

    it("joins several types with a plus sign", () => {
        expect(filterSelectionLabel("types", [{ label: "Income" }, { label: "Expense" }])).toBe("Income + Expense");
    });

    it("names a single selected type by its label", () => {
        expect(filterSelectionLabel("types", [{ label: "Transfer" }])).toBe("Transfer");
    });
});

describe("FILTER_COPY", () => {
    it("gives each filter its heading and all-wording", () => {
        expect(FILTER_COPY.categories).toEqual({ title: "Categories", allLabel: "All categories" });
        expect(FILTER_COPY.accounts).toEqual({ title: "Accounts", allLabel: "All accounts" });
        expect(FILTER_COPY.types).toEqual({ title: "Type", allLabel: "All types" });
    });
});
