import { describe, expect, it } from "vitest";
import { mountSuspended } from "@nuxt/test-utils/runtime";
import type { IRule } from "@badger/types";
import type { RuleDisplayContext } from "~/utils/ruleSentence";
import RuleRow from "./RuleRow.vue";

const makeRule = (overrides: Partial<IRule> = {}): IRule => ({
    id: "rule-1",
    name: "Coffee shops",
    priority: 1,
    stopOnMatch: false,
    isActive: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    conditions: [
        { id: "cond-1", field: "description", operator: "contains", value: "starbucks", position: 0 },
        { id: "cond-2", field: "amount", operator: "lessThan", value: "50.00", position: 1 },
    ],
    actions: [{ id: "action-1", type: "set_category", value: "cat-coffee", position: 0 }],
    ...overrides,
});

const context: RuleDisplayContext = {
    accountName: () => undefined,
    category: (id) => (id === "cat-coffee" ? { name: "Coffee", color: "#a16207" } : undefined),
};

describe("RuleRow", () => {
    it("reads the rule as a sentence with the values in bold and the category chip", async () => {
        const wrapper = await mountSuspended(RuleRow, { props: { rule: makeRule(), context } });

        expect(wrapper.text()).toContain("Coffee shops");
        expect(wrapper.text()).toContain("When description contains");
        expect(wrapper.text()).toContain("and amount is less than");
        expect(wrapper.findAll("b").map((bold) => bold.text())).toEqual(["starbucks", "50.00"]);
        expect(wrapper.text()).toContain("Coffee");
    });

    it("adds then stop only when the rule stops later rules", async () => {
        const without = await mountSuspended(RuleRow, { props: { rule: makeRule(), context } });
        expect(without.text()).not.toContain("then stop");

        const withStop = await mountSuspended(RuleRow, {
            props: { rule: makeRule({ stopOnMatch: true }), context },
        });
        expect(withStop.text()).toContain("then stop");
    });

    it("dims the text of an off rule and leaves an on rule at full strength", async () => {
        const on = await mountSuspended(RuleRow, { props: { rule: makeRule(), context } });
        expect(on.find(".opacity-60").exists()).toBe(false);

        const off = await mountSuspended(RuleRow, {
            props: { rule: makeRule({ isActive: false }), context },
        });
        expect(off.find(".opacity-60").exists()).toBe(true);
        expect(off.find(".opacity-60").text()).toContain("Coffee shops");
    });

    it("emits the new on/off value when the switch changes", async () => {
        const wrapper = await mountSuspended(RuleRow, { props: { rule: makeRule(), context } });

        await wrapper.find('input[aria-label="Rule on"]').setValue(false);

        expect(wrapper.emitted("toggle")).toEqual([[false]]);
    });

    it("emits actions from the ⋮ trigger", async () => {
        const wrapper = await mountSuspended(RuleRow, { props: { rule: makeRule(), context } });

        await wrapper.find('button[aria-label="Rule actions"]').trigger("click");

        expect(wrapper.emitted("actions")).toHaveLength(1);
    });
});
