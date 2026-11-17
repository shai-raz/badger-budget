import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockNuxtImport, mountSuspended } from "@nuxt/test-utils/runtime";
import { flushPromises, type VueWrapper } from "@vue/test-utils";
import { ref } from "vue";
import type { IAccountResponse } from "@badger/types";
import { formatCurrency } from "~/utils/currency";
import AccountsSection from "./AccountsSection.vue";

const layout = vi.hoisted(() => ({ desktop: true }));
const accountsState = vi.hoisted(() => ({ list: [] as IAccountResponse[] }));

mockNuxtImport("useIsDesktop", () => () => ref(layout.desktop));
mockNuxtImport("useUpdateLedgerBalance", () => () => ({ mutateAsync: vi.fn() }));
// AccountsSection imports useGetAccounts explicitly, so mock the module itself.
vi.mock("~/composables/accounts/useAccounts", async () => {
    const { ref } = await import("vue");
    return {
        useGetAccounts: () => ({
            data: ref(accountsState.list),
            isLoading: ref(false),
            error: ref(null),
        }),
    };
});

const account = (
    id: string,
    fields: Pick<IAccountResponse, "name" | "type" | "balance" | "balanceKind"> & Partial<IAccountResponse>,
): IAccountResponse => ({
    id,
    accountNumber: null,
    hiddenOnOverview: false,
    icon: null,
    color: null,
    currencyId: null,
    currency: null,
    balanceDate: null,
    balanceUpdatedAt: null,
    cardFrame: null,
    cardIssuer: null,
    hasLinkedTransfers: false,
    hasTransactions: false,
    lastTransactionDate: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...fields,
});

const checking = account("acc-checking", {
    name: "Joint Checking",
    type: "bank",
    balance: 1000,
    balanceKind: "account_balance",
});
const savings = account("acc-savings", {
    name: "Rainy Day Savings",
    type: "bank",
    balance: 2500,
    balanceKind: "account_balance",
    hiddenOnOverview: true,
});
const visa = account("acc-visa", {
    name: "Travel Visa",
    type: "credit_card",
    balance: -300,
    balanceKind: "next_charge",
    cardFrame: 5000,
    hiddenOnOverview: true,
});
const noBalance = account("acc-nobal", {
    name: "Dormant Account",
    type: "bank",
    balance: null,
    balanceKind: null,
});

const mounted: VueWrapper[] = [];

const mountSection = async (list: IAccountResponse[]) => {
    accountsState.list = list;
    const wrapper = await mountSuspended(AccountsSection);
    mounted.push(wrapper);
    await flushPromises();
    return wrapper;
};

afterEach(() => {
    for (const wrapper of mounted.splice(0)) wrapper.unmount();
    vi.restoreAllMocks();
});

beforeEach(() => {
    layout.desktop = true;
});

describe("AccountsSection hidden accounts", () => {
    it("desktop: renders only the shown account tile", async () => {
        const wrapper = await mountSection([checking, savings]);

        expect(wrapper.text()).toContain("Joint Checking");
        expect(wrapper.text()).not.toContain("Rainy Day Savings");
    });

    it("mobile: renders only the shown account row, and the header total includes hidden bank balances", async () => {
        layout.desktop = false;
        const wrapper = await mountSection([checking, savings]);

        expect(wrapper.text()).toContain("Joint Checking");
        expect(wrapper.text()).not.toContain("Rainy Day Savings");
        expect(wrapper.text()).toContain(`${formatCurrency(3500)} total`);
    });

    it("shows the all-hidden empty state with a link to manage accounts when every balance account is hidden", async () => {
        const wrapper = await mountSection([savings, visa, noBalance]);

        expect(wrapper.text()).toContain("All accounts are hidden from Overview");
        expect(wrapper.text()).not.toContain("No account balances yet");
        expect(wrapper.text()).not.toContain("Rainy Day Savings");
        expect(wrapper.text()).not.toContain("Travel Visa");

        const manage = wrapper
            .findAll("a")
            .find((link) => link.attributes("href") === "/accounts" && link.text() === "Manage accounts");
        expect(manage).toBeDefined();
    });

    it("mobile: shows the all-hidden empty state with the icon and the header total, which still includes hidden bank balances", async () => {
        layout.desktop = false;
        const wrapper = await mountSection([savings, visa, noBalance]);

        expect(wrapper.text()).toContain(`${formatCurrency(2500)} total`);
        expect(wrapper.text()).toContain("All accounts are hidden from Overview");
        expect(wrapper.text()).not.toContain("No account balances yet");
        expect(wrapper.find("i.pi-eye-slash").exists()).toBe(true);
    });

    it("shows the no-balances empty state when there are no accounts", async () => {
        const wrapper = await mountSection([]);

        expect(wrapper.text()).toContain("No account balances yet");
        expect(wrapper.text()).not.toContain("All accounts are hidden from Overview");
    });

    it("shows the no-balances empty state, not the all-hidden text, when only no-balance accounts exist", async () => {
        const wrapper = await mountSection([noBalance]);

        expect(wrapper.text()).toContain("No account balances yet");
        expect(wrapper.text()).not.toContain("All accounts are hidden from Overview");
    });
});
