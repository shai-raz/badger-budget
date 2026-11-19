import { afterEach, describe, expect, it, vi } from "vitest";
import { mountSuspended } from "@nuxt/test-utils/runtime";
import { useNuxtApp } from "#app";
import { flushPromises, type VueWrapper } from "@vue/test-utils";
import type { IAccountResponse } from "@badger/types";
import AccountRow from "./AccountRow.vue";

const base: IAccountResponse = {
    id: "acc-1",
    name: "Checking",
    accountNumber: null,
    hiddenOnOverview: false,
    type: "bank",
    icon: null,
    color: null,
    currencyId: null,
    currency: null,
    balance: 1250,
    balanceKind: "account_balance",
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

const cash: IAccountResponse = {
    ...base,
    id: "acc-cash",
    name: "Wallet",
    type: "cash",
    balance: 120,
    balanceKind: "cash_on_hand",
};

const mounted: VueWrapper[] = [];

const mountRow = async (props: { account: IAccountResponse; manageable?: boolean }) => {
    const wrapper = await mountSuspended(AccountRow, { props });
    mounted.push(wrapper);
    await flushPromises();
    return wrapper;
};

const findButton = (wrapper: VueWrapper, label: string) =>
    wrapper.findAll("button").find((button) => button.text() === label);

afterEach(() => {
    for (const wrapper of mounted.splice(0)) wrapper.unmount();
    vi.restoreAllMocks();
});

describe("AccountRow", () => {
    it("links the account name to its transactions, filtered to the account", async () => {
        const wrapper = await mountRow({ account: base });
        const link = wrapper.find("a");
        expect(link.text()).toBe("Checking");
        expect(link.attributes("href")).toBe("/transactions?accounts=acc-1");
    });

    it("emits updateCash from Update and does not navigate", async () => {
        const push = vi.spyOn(useNuxtApp().$router, "push");
        const wrapper = await mountRow({ account: cash });

        await findButton(wrapper, "Update")?.trigger("click");

        expect(wrapper.emitted("updateCash")).toHaveLength(1);
        expect(push).not.toHaveBeenCalled();
    });

    it("emits menuToggle from the ⋮ button and does not navigate", async () => {
        const push = vi.spyOn(useNuxtApp().$router, "push");
        const wrapper = await mountRow({ account: base, manageable: true });

        await wrapper.find('[aria-label="Account actions"]').trigger("click");

        expect(wrapper.emitted("menuToggle")).toHaveLength(1);
        expect(wrapper.emitted("menuToggle")?.[0]?.[0]).toMatchObject({ account: { id: "acc-1" } });
        expect(push).not.toHaveBeenCalled();
    });

    it("shows a decorative chevron only on rows without the ⋮ button", async () => {
        const plain = await mountRow({ account: base });
        const chevron = plain.find(".pi-chevron-right");
        expect(chevron.exists()).toBe(true);
        expect(chevron.attributes("aria-hidden")).toBe("true");

        const manageable = await mountRow({ account: base, manageable: true });
        expect(manageable.find(".pi-chevron-right").exists()).toBe(false);
    });

    it("stacks Update and the ⋮ button above the stretched link", async () => {
        const manageable = await mountRow({ account: base, manageable: true });
        expect(manageable.find('[aria-label="Account actions"]').classes()).toContain("z-10");

        const withUpdate = await mountRow({ account: cash });
        expect(findButton(withUpdate, "Update")?.classes()).toContain("z-10");
    });

    it("shows the hidden tag on a manageable hidden account", async () => {
        const wrapper = await mountRow({ account: { ...base, hiddenOnOverview: true }, manageable: true });
        expect(wrapper.text()).toContain("Hidden on Overview");
    });

    it("omits the hidden tag when the account is shown or the row is not manageable", async () => {
        const shown = await mountRow({ account: base, manageable: true });
        expect(shown.text()).not.toContain("Hidden on Overview");

        const overview = await mountRow({ account: { ...base, hiddenOnOverview: true } });
        expect(overview.text()).not.toContain("Hidden on Overview");
    });

    it("places the hidden tag under the subtitle in the name column", async () => {
        const wrapper = await mountRow({ account: { ...base, hiddenOnOverview: true }, manageable: true });
        const column = wrapper.find(".min-w-0.flex-1");
        const html = column.html();
        const subtitle = column.find("p.text-muted-color").text();
        expect(column.text()).toContain("Hidden on Overview");
        expect(html.indexOf("Hidden on Overview")).toBeGreaterThan(html.indexOf(subtitle));
    });
});
