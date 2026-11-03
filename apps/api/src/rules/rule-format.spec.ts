import { autoRuleName, describeCondition, formatRuleAmount } from "@badger/utils";

describe("formatRuleAmount", () => {
    it("formats with two decimals and thousands separators", () => {
        expect(formatRuleAmount("1000")).toBe("1,000.00");
        expect(formatRuleAmount("12.5")).toBe("12.50");
        expect(formatRuleAmount("-42")).toBe("-42.00");
    });

    it("returns the input unchanged when it is not a finite number", () => {
        expect(formatRuleAmount("abc")).toBe("abc");
        expect(formatRuleAmount("Infinity")).toBe("Infinity");
        expect(formatRuleAmount("")).toBe("");
    });
});

describe("describeCondition", () => {
    it("uses lower-case field labels and operator labels", () => {
        expect(describeCondition({ field: "originalCategory", operator: "startsWith", value: "Food" })).toEqual({
            field: "original category",
            operator: "starts with",
            value: "Food",
        });
        expect(describeCondition({ field: "amount", operator: "greaterThan", value: "1000" })).toEqual({
            field: "amount",
            operator: "is more than",
            value: "1,000.00",
        });
        expect(describeCondition({ field: "amount", operator: "lessThan", value: "5" })).toMatchObject({
            operator: "is less than",
        });
        expect(describeCondition({ field: "description", operator: "equals", value: "x" })).toMatchObject({
            operator: "is",
        });
    });

    it("names the account through the context, and falls back when it is unknown", () => {
        const accountName = (id: string) => (id === "acc-1" ? "Checking" : undefined);
        expect(describeCondition({ field: "account", operator: "equals", value: "acc-1" }, { accountName }).value).toBe(
            "Checking",
        );
        expect(describeCondition({ field: "account", operator: "equals", value: "acc-9" }, { accountName }).value).toBe(
            "Unknown account",
        );
        expect(describeCondition({ field: "account", operator: "equals", value: "acc-9" }).value).toBe(
            "Unknown account",
        );
    });

    it("shows the transaction type label, and the raw value for an unknown type", () => {
        expect(describeCondition({ field: "type", operator: "equals", value: "income" }).value).toBe("Income");
        expect(describeCondition({ field: "type", operator: "equals", value: "bogus" }).value).toBe("bogus");
    });
});

describe("autoRuleName", () => {
    it("builds the name from the first condition", () => {
        expect(autoRuleName([{ field: "description", operator: "contains", value: "starbucks" }])).toBe(
            "Description contains starbucks",
        );
        expect(autoRuleName([{ field: "amount", operator: "greaterThan", value: "1000" }])).toBe(
            "Amount is more than 1,000.00",
        );
    });

    it("uses the first condition only", () => {
        expect(
            autoRuleName([
                { field: "type", operator: "equals", value: "expense" },
                { field: "description", operator: "contains", value: "x" },
            ]),
        ).toBe("Type is Expense");
    });

    it("returns an empty string with no conditions", () => {
        expect(autoRuleName([])).toBe("");
    });

    it("caps the name at the rule name limit", () => {
        const name = autoRuleName([{ field: "description", operator: "contains", value: "a".repeat(300) }]);
        expect(Array.from(name).length).toBeLessThanOrEqual(200);
        expect(name.startsWith("Description contains aaa")).toBe(true);
    });
});
