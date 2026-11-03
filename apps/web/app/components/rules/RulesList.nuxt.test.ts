import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockNuxtImport, mountSuspended } from "@nuxt/test-utils/runtime";
import { flushPromises, type DOMWrapper, type VueWrapper } from "@vue/test-utils";
import { ref } from "vue";
import type { IRule } from "@badger/types";
import type { RuleDisplayContext } from "~/utils/ruleSentence";
import RulesList from "./RulesList.vue";

const layout = vi.hoisted(() => ({ desktop: false }));
const apiClient = vi.hoisted(() => ({ reorderRules: vi.fn(async () => undefined) }));

mockNuxtImport("useIsDesktop", () => () => ref(layout.desktop));
mockNuxtImport("useApiClient", () => () => apiClient);

const makeRule = (id: string, name: string, priority: number): IRule => ({
    id,
    name,
    priority,
    stopOnMatch: false,
    isActive: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    conditions: [{ id: `${id}-cond`, field: "description", operator: "contains", value: name, position: 0 }],
    actions: [],
});

const rules = [makeRule("a", "Alpha", 1), makeRule("b", "Bravo", 2), makeRule("c", "Charlie", 3)];

const context: RuleDisplayContext = {
    accountName: () => undefined,
    category: () => undefined,
};

const mountList = () => mountSuspended(RulesList, { props: { rules, context } });

const rowNames = (wrapper: VueWrapper) => wrapper.findAll("span.truncate").map((name) => name.text());

/** The element at `index`; fails the test when the list is shorter than expected. */
const at = <T>(items: T[], index: number): T => {
    const item = items[index];
    if (item === undefined) throw new Error(`no item at index ${index}`);
    return item;
};

const buttonWithText = (wrapper: VueWrapper, text: string) =>
    wrapper.findAll("button").find((button) => button.text() === text);

const clickButton = async (wrapper: VueWrapper, text: string) => {
    const button = buttonWithText(wrapper, text);
    if (!button) throw new Error(`no button labelled ${text}`);
    await button.trigger("click");
};

const moveDownButtons = (wrapper: VueWrapper) => wrapper.findAll('button[aria-label="Move down"]');

const grips = (wrapper: VueWrapper): DOMWrapper<Element>[] => wrapper.findAll(".rule-grip");

describe("RulesList on phone", () => {
    beforeEach(() => {
        layout.desktop = false;
        apiClient.reorderRules.mockReset();
        apiClient.reorderRules.mockResolvedValue(undefined);
    });

    it("sends one request with the new order when Done follows two moves", async () => {
        const wrapper = await mountList();

        await clickButton(wrapper, "Reorder");
        await at(moveDownButtons(wrapper), 0).trigger("click"); // Alpha down: Bravo, Alpha, Charlie
        await at(moveDownButtons(wrapper), 1).trigger("click"); // Alpha down again: Bravo, Charlie, Alpha

        expect(rowNames(wrapper)).toEqual(["Bravo", "Charlie", "Alpha"]);
        expect(apiClient.reorderRules).not.toHaveBeenCalled();

        await clickButton(wrapper, "Done");
        await flushPromises();

        expect(apiClient.reorderRules).toHaveBeenCalledTimes(1);
        expect(apiClient.reorderRules).toHaveBeenCalledWith(["b", "c", "a"]);
        expect(buttonWithText(wrapper, "Reorder")).toBeDefined();
    });

    it("sends no request and restores the saved order on Cancel", async () => {
        const wrapper = await mountList();

        await clickButton(wrapper, "Reorder");
        await at(moveDownButtons(wrapper), 0).trigger("click");
        expect(rowNames(wrapper)).toEqual(["Bravo", "Alpha", "Charlie"]);

        await clickButton(wrapper, "Cancel");
        await flushPromises();

        expect(rowNames(wrapper)).toEqual(["Alpha", "Bravo", "Charlie"]);
        expect(apiClient.reorderRules).not.toHaveBeenCalled();
        expect(buttonWithText(wrapper, "Reorder")).toBeDefined();
    });

    it("sends no request and just leaves the mode when Done follows no moves", async () => {
        const wrapper = await mountList();

        await clickButton(wrapper, "Reorder");
        await clickButton(wrapper, "Done");
        await flushPromises();

        expect(apiClient.reorderRules).not.toHaveBeenCalled();
        expect(buttonWithText(wrapper, "Reorder")).toBeDefined();
    });

    it("keeps the mode open with the new order when the save fails", async () => {
        apiClient.reorderRules.mockRejectedValueOnce(new Error("boom"));
        const wrapper = await mountList();

        await clickButton(wrapper, "Reorder");
        await at(moveDownButtons(wrapper), 0).trigger("click");
        await clickButton(wrapper, "Done");
        await flushPromises();

        expect(apiClient.reorderRules).toHaveBeenCalledTimes(1);
        expect(buttonWithText(wrapper, "Done")).toBeDefined();
        expect(rowNames(wrapper)).toEqual(["Bravo", "Alpha", "Charlie"]);
    });
});

describe("RulesList on desktop", () => {
    beforeEach(() => {
        layout.desktop = true;
        apiClient.reorderRules.mockReset();
        apiClient.reorderRules.mockResolvedValue(undefined);
    });

    it("moves a picked row from the keyboard and saves once on drop", async () => {
        const wrapper = await mountList();
        const alphaGrip = at(grips(wrapper), 0);

        await alphaGrip.trigger("keydown", { key: " " }); // pick up Alpha
        await alphaGrip.trigger("keydown", { key: "ArrowDown" });
        await alphaGrip.trigger("keydown", { key: "ArrowDown" });
        expect(rowNames(wrapper)).toEqual(["Bravo", "Charlie", "Alpha"]);
        expect(apiClient.reorderRules).not.toHaveBeenCalled();

        await alphaGrip.trigger("keydown", { key: " " }); // drop
        await flushPromises();

        expect(apiClient.reorderRules).toHaveBeenCalledTimes(1);
        expect(apiClient.reorderRules).toHaveBeenCalledWith(["b", "c", "a"]);
    });

    it("restores the order on Escape without saving", async () => {
        const wrapper = await mountList();
        const alphaGrip = at(grips(wrapper), 0);

        await alphaGrip.trigger("keydown", { key: " " });
        await alphaGrip.trigger("keydown", { key: "ArrowDown" });
        await alphaGrip.trigger("keydown", { key: "Escape" });
        await flushPromises();

        expect(rowNames(wrapper)).toEqual(["Alpha", "Bravo", "Charlie"]);
        expect(apiClient.reorderRules).not.toHaveBeenCalled();
    });

    it("disables the grips while a search is active", async () => {
        const wrapper = await mountList();

        await wrapper.find('input[aria-label="Search rules"]').setValue("Alpha");

        expect(grips(wrapper).every((grip) => grip.attributes("disabled") !== undefined)).toBe(true);
    });
});
