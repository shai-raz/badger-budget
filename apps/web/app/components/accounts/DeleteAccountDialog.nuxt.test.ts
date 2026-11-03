import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockNuxtImport, mountSuspended } from "@nuxt/test-utils/runtime";
import { flushPromises, type VueWrapper } from "@vue/test-utils";
import { ref } from "vue";
import type { AccountRuleUsageResponse, IAccountResponse } from "@badger/types";
import DeleteAccountDialog from "./DeleteAccountDialog.vue";
import StatusTag from "../shared/StatusTag.vue";

const usage = vi.hoisted(() => ({
    data: undefined as AccountRuleUsageResponse | undefined,
    isFetching: false,
    isError: false,
}));
const deleteAccount = vi.hoisted(() => vi.fn(async () => undefined));

mockNuxtImport("useAccountRuleUsageQuery", () => () => ({
    data: ref(usage.data),
    isFetching: ref(usage.isFetching),
    isError: ref(usage.isError),
}));
mockNuxtImport("useDeleteAccount", () => () => ({ mutateAsync: deleteAccount }));

const account: IAccountResponse = {
    id: "acc-1",
    name: "Checking",
    accountNumber: null,
    type: "bank",
    icon: null,
    color: null,
    currencyId: null,
    currency: null,
    balance: null,
    balanceKind: null,
    balanceDate: null,
    balanceUpdatedAt: null,
    cardFrame: null,
    cardIssuer: null,
    hasLinkedTransfers: false,
    hasTransactions: false,
    lastTransactionDate: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

const mounted: VueWrapper[] = [];

const mountDialog = async () => {
    const wrapper = await mountSuspended(DeleteAccountDialog, { props: { visible: true, account } });
    mounted.push(wrapper);
    await flushPromises();
    return wrapper;
};

// The dialog teleports to <body>, so its content is read from the document.
const affectedList = () => document.body.querySelector<HTMLElement>('[aria-label="Rules that will change"]');

const findButton = (label: string) =>
    Array.from(document.body.querySelectorAll<HTMLButtonElement>("button")).find(
        (button) => button.textContent?.trim() === label,
    );

const deleteButton = () => {
    const button = findButton("Delete account");
    if (!button) throw new Error("no Delete account button");
    return button;
};

beforeEach(() => {
    usage.data = undefined;
    usage.isFetching = false;
    usage.isError = false;
    deleteAccount.mockClear();
});

afterEach(() => {
    mounted.splice(0).forEach((wrapper) => wrapper.unmount());
});

describe("DeleteAccountDialog", () => {
    it("lists each affected rule with its outcome tag", async () => {
        usage.data = {
            rules: [
                { id: "rule-1", name: "Groceries", outcome: "condition_removed" },
                { id: "rule-2", name: "Old salary", outcome: "rule_deleted" },
            ],
        };

        const wrapper = await mountDialog();

        expect(document.body.textContent).toContain("2 rules use this account and will change:");
        const list = affectedList();
        expect(list).not.toBeNull();
        expect(
            Array.from(list?.querySelectorAll("li") ?? []).map((item) => item.querySelector("span")?.textContent),
        ).toEqual(["Groceries", "Old salary"]);
        const tags = wrapper.findAllComponents(StatusTag);
        expect(tags.map((tag) => tag.props("value"))).toEqual(["Condition removed", "Rule deleted"]);
        expect(tags.map((tag) => tag.props("tone"))).toEqual(["neutral", "danger"]);
        expect(document.body.textContent).toContain("A rule with no other conditions is deleted.");
    });

    it("uses the singular lead for one affected rule", async () => {
        usage.data = { rules: [{ id: "rule-1", name: "Groceries", outcome: "condition_removed" }] };

        await mountDialog();

        expect(document.body.textContent).toContain("1 rule uses this account and will change:");
        expect(document.body.textContent).not.toContain("1 rules");
    });

    it("shows only the title and message when no rule is affected", async () => {
        usage.data = { rules: [] };

        await mountDialog();

        expect(document.body.textContent).toContain('Delete "Checking"?');
        expect(document.body.textContent).toContain("This can't be undone.");
        expect(affectedList()).toBeNull();
        expect(document.body.textContent).not.toContain("will change");
    });

    it("keeps Delete disabled while the usage loads", async () => {
        usage.isFetching = true;

        await mountDialog();

        expect(deleteButton().disabled).toBe(true);
    });

    it("shows an error and keeps Delete disabled when the usage fails to load", async () => {
        usage.isError = true;

        await mountDialog();

        expect(document.body.textContent).toContain("Couldn't load the rules this account uses.");
        expect(deleteButton().disabled).toBe(true);
    });

    it("enables Delete once the usage has loaded", async () => {
        usage.data = { rules: [] };

        await mountDialog();

        expect(deleteButton().disabled).toBe(false);
    });

    it("deletes the account when confirmed", async () => {
        usage.data = { rules: [] };
        await mountDialog();

        deleteButton().click();
        await flushPromises();

        expect(deleteAccount).toHaveBeenCalledWith("acc-1");
    });
});
