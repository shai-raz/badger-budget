import { beforeEach, describe, expect, it, vi } from "vitest";
import { computed, nextTick, ref } from "vue";
import type { ITransactionResponse } from "@badger/types";

import { useTransactionRowActions } from "./useTransactionRowActions";

const openFromTransaction = vi.fn();

vi.mock("../useRuleEditorDialog", () => ({
    useRuleEditorDialog: () => ({ openFromTransaction }),
}));
vi.mock("./useTransferActions", () => ({
    MIRROR_ACTION_TOOLTIP: "mirror",
    useTransferActions: () => ({ menuItems: computed(() => []) }),
}));
vi.mock("./useReimbursementPicker", () => ({
    useReimbursementPicker: () => ({ open: vi.fn() }),
}));

// The composable uses Nuxt's auto-imported helpers; expose Vue's own for the unit test.
vi.stubGlobal("ref", ref);
vi.stubGlobal("computed", computed);
vi.stubGlobal("nextTick", nextTick);

beforeEach(() => {
    vi.clearAllMocks();
});

const tx = { id: "t1", type: "expense", counterpartOfId: null } as unknown as ITransactionResponse;

type MenuCommand = { label?: string; command?: () => void };

const menuItem = (label: string) => {
    const actions = useTransactionRowActions();
    actions.openMenu(new Event("click"), tx);
    const item = (actions.menuItems.value as MenuCommand[]).find((i) => i.label === label);
    return { actions, item };
};

describe("useTransactionRowActions rule entry", () => {
    it("offers Create rule and no longer Apply category rule", () => {
        const { actions } = menuItem("Create rule");
        const labels = actions.menuItems.value.map((i) => i.label);

        expect(labels).toContain("Create rule");
        expect(labels).not.toContain("Apply category rule");
    });

    it("Create rule opens the rule editor prefilled from the selected transaction", () => {
        const { item } = menuItem("Create rule");

        item?.command?.();

        expect(openFromTransaction).toHaveBeenCalledWith(tx);
    });

    it("hands an Edit transaction 'create rule' over to the rule editor after closing Edit", async () => {
        const actions = useTransactionRowActions();
        actions.showEditModal.value = true;

        const pending = actions.openCreateRuleFromEdit(tx);
        expect(actions.showEditModal.value).toBe(false);
        await pending;

        expect(openFromTransaction).toHaveBeenCalledWith(tx);
    });
});
