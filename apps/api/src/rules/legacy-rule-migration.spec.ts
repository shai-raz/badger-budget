import { readFileSync } from "fs";
import { join } from "path";
import { RULE_FIELD_LABELS, RULE_NAME_MAX_LENGTH, RULE_OPERATOR_LABELS } from "@badger/shared-data";
import { autoRuleName, type MatchableCondition } from "@badger/utils";

// The migration is hand-written SQL, so these tests read it and pin the parts that must agree with the TypeScript
// vocabulary and naming. The SQL itself is run against a real database when the migration is applied.
const sql = readFileSync(
    join(__dirname, "../../prisma/migrations/20261103130000_migrate_category_mapping_rules/migration.sql"),
    "utf8",
);

const legacyFields = ["description", "originalCategory", "amount"] as const;
const legacyOperators = ["contains", "equals", "startsWith", "endsWith", "greaterThan", "lessThan"] as const;

describe("legacy category mapping rule migration", () => {
    it.each(legacyFields)("names the %s field with its exact label", (field) => {
        expect(sql).toContain(`'${RULE_FIELD_LABELS[field]}'`);
    });

    it.each(legacyOperators)("names the %s operator with its exact label", (operator) => {
        expect(sql).toContain(`'${RULE_OPERATOR_LABELS[operator]}'`);
    });

    it("formats amount values with thousands separators and two decimals", () => {
        expect(sql).toContain("'FM999,999,999,990.00'");
    });

    it("copies only amounts with at most two decimals, the limit RulesService enforces, in every copy step", () => {
        const pattern = String.raw`'^[0-9]+(\.[0-9]{1,2})?$'`;
        expect(sql.split(pattern)).toHaveLength(4);
    });

    it("truncates the name to the rule name limit", () => {
        expect(sql).toContain(`${RULE_NAME_MAX_LENGTH}))`);
    });

    it("copies only active legacy rules", () => {
        expect(sql).toMatch(/r\.is_active = true/);
    });

    it("drops the legacy table after copying", () => {
        expect(sql).toMatch(/DROP TABLE "category_mapping_rules";\s*$/);
    });

    it.each<[string, MatchableCondition, string]>([
        [
            "description contains",
            { field: "description", operator: "contains", value: "starbucks" },
            "Description contains starbucks",
        ],
        [
            "description starts with",
            { field: "description", operator: "startsWith", value: "Amzn" },
            "Description starts with Amzn",
        ],
        [
            "description ends with",
            { field: "description", operator: "endsWith", value: ".com" },
            "Description ends with .com",
        ],
        [
            "original category is",
            { field: "originalCategory", operator: "equals", value: "Groceries" },
            "Original category is Groceries",
        ],
        [
            "amount is more than",
            { field: "amount", operator: "greaterThan", value: "1000" },
            "Amount is more than 1,000.00",
        ],
        ["amount is less than", { field: "amount", operator: "lessThan", value: "0.5" }, "Amount is less than 0.50"],
        ["amount is, padded value", { field: "amount", operator: "equals", value: " 12.5 " }, "Amount is 12.50"],
    ])("names a legacy %s rule as the SQL does", (_name, condition, expected) => {
        expect(autoRuleName([condition])).toBe(expected);
    });
});
