import type { IRule, ITransactionResponse } from "@badger/types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref, type Ref } from "vue";

import { useRuleEditorDialog, type RuleEditorDialogState } from "./useRuleEditorDialog";

let shared: Ref<RuleEditorDialogState>;

beforeEach(() => {
    shared = ref<RuleEditorDialogState>({
        visible: false,
        mode: "create",
        rule: null,
        prefillTransaction: null,
        openCount: 0,
    });
    vi.stubGlobal("useState", () => shared);
});

const rule = { id: "rule-1", name: "Coffee" } as IRule;
const transaction = { id: "tx-1", description: "STARBUCKS" } as ITransactionResponse;

describe("useRuleEditorDialog", () => {
    it("opens a blank create dialog", () => {
        useRuleEditorDialog().openCreate();
        expect(shared.value).toMatchObject({
            visible: true,
            mode: "create",
            rule: null,
            prefillTransaction: null,
            openCount: 1,
        });
    });

    it("opens an edit dialog for a rule", () => {
        useRuleEditorDialog().openEdit(rule);
        expect(shared.value).toMatchObject({ visible: true, mode: "edit", rule, prefillTransaction: null });
    });

    it("opens a create dialog prefilled from a transaction", () => {
        useRuleEditorDialog().openFromTransaction(transaction);
        expect(shared.value).toMatchObject({
            visible: true,
            mode: "create",
            rule: null,
            prefillTransaction: transaction,
        });
    });

    it("bumps openCount on every open so the editor remounts", () => {
        const dialog = useRuleEditorDialog();
        dialog.openCreate();
        dialog.close();
        dialog.openEdit(rule);
        expect(shared.value.openCount).toBe(2);
    });

    it("hides the dialog on close and keeps the last context", () => {
        const dialog = useRuleEditorDialog();
        dialog.openEdit(rule);
        dialog.close();
        expect(shared.value).toMatchObject({ visible: false, mode: "edit", rule });
    });
});
