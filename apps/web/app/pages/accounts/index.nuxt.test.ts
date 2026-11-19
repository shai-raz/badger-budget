import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockNuxtImport, mountSuspended } from "@nuxt/test-utils/runtime";
import { flushPromises, type VueWrapper } from "@vue/test-utils";
import { ref } from "vue";
import type { IAccountResponse } from "@badger/types";
import AccountsPage from "./index.vue";

const updateAccount = vi.hoisted(() => vi.fn());
const toastAdd = vi.hoisted(() => vi.fn());

mockNuxtImport("useGetAccounts", () => () => ({
    data: ref<IAccountResponse[]>([]),
    isLoading: ref(false),
    error: ref(null),
}));
mockNuxtImport("useUpdateAccount", () => () => ({ mutateAsync: updateAccount }));
vi.mock("primevue/usetoast", () => ({ useToast: () => ({ add: toastAdd }) }));

const account = (id: string, hiddenOnOverview: boolean): IAccountResponse => ({
    id,
    name: `Account ${id}`,
    accountNumber: null,
    hiddenOnOverview,
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
});

const mounted: VueWrapper[] = [];

const mountPage = async () => {
    const wrapper = await mountSuspended(AccountsPage);
    mounted.push(wrapper);
    await flushPromises();
    return wrapper as unknown as { vm: { handleToggleOverview: (a: IAccountResponse) => Promise<void> } };
};

beforeEach(() => {
    updateAccount.mockReset();
    toastAdd.mockClear();
});

afterEach(() => {
    mounted.splice(0).forEach((wrapper) => wrapper.unmount());
});

describe("Accounts page: Hide/Show on Overview", () => {
    it("sends the negated hiddenOnOverview flag", async () => {
        updateAccount.mockResolvedValue(undefined);
        const page = await mountPage();

        await page.vm.handleToggleOverview(account("a", false));

        expect(updateAccount).toHaveBeenCalledWith({ id: "a", data: { hiddenOnOverview: true } });
        expect(toastAdd).not.toHaveBeenCalled();
    });

    it("reports a failed toggle even when a later toggle has started", async () => {
        let rejectFirst: (error: Error) => void = () => undefined;
        updateAccount
            .mockReturnValueOnce(new Promise((_, reject) => (rejectFirst = reject)))
            .mockResolvedValueOnce(undefined);
        const page = await mountPage();

        const first = page.vm.handleToggleOverview(account("a", false));
        const second = page.vm.handleToggleOverview(account("b", false));
        await second;
        rejectFirst(new Error("boom"));
        await first;

        expect(toastAdd).toHaveBeenCalledTimes(1);
        expect(toastAdd).toHaveBeenCalledWith(expect.objectContaining({ severity: "error", summary: "Error" }));
    });
});
