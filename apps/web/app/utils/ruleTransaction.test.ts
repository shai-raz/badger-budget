import type { ITransactionResponse } from "@badger/types";
import { describe, expect, it } from "vitest";
import { toRuleTransaction } from "./ruleTransaction";

const txFixture = (over: Partial<ITransactionResponse> = {}) =>
    ({
        id: "tx-1",
        type: "expense",
        amount: -42.5,
        accountId: "acc-1",
        description: "Bank coffee",
        originalCategory: "Food",
        categoryId: "cat-1",
        ...over,
    }) as ITransactionResponse;

describe("toRuleTransaction", () => {
    it("maps the fields rules are evaluated against", () => {
        expect(toRuleTransaction(txFixture())).toEqual({
            description: "Bank coffee",
            originalCategory: "Food",
            amount: -42.5,
            accountId: "acc-1",
            type: "expense",
        });
    });

    it("keeps a missing original category as null", () => {
        expect(toRuleTransaction(txFixture({ originalCategory: null })).originalCategory).toBeNull();
    });

    it("ignores fields rules do not test", () => {
        const mapped = toRuleTransaction(txFixture());
        expect(mapped).not.toHaveProperty("id");
        expect(mapped).not.toHaveProperty("categoryId");
    });
});
