import { beforeEach, describe, expect, it, vi } from "vitest";
import { computed, ref } from "vue";
import type { ITransactionResponse } from "@badger/types";

import { useTransferActions } from "./useTransferActions";

const toastAdd = vi.fn();
const mutate = vi.fn();

vi.mock("primevue/usetoast", () => ({ useToast: () => ({ add: toastAdd }) }));
vi.mock("./useUpdateTransaction.mutation", () => ({
    useUpdateTransactionMutation: () => ({ mutate, isPending: ref(false) }),
}));

// The composable uses Nuxt's auto-imported `computed`; expose Vue's own for the unit test.
vi.stubGlobal("computed", computed);

beforeEach(() => {
    vi.clearAllMocks();
    mutate.mockImplementation((_args: unknown, opts: { onSuccess: () => void }) => opts.onSuccess());
});

const transfer = (counterpart: unknown): ITransactionResponse =>
    ({
        id: "t1",
        type: "transfer",
        transferDirection: "out",
        counterpartOfId: null,
        hidden: false,
        counterpart,
    }) as unknown as ITransactionResponse;

const revert = (tx: ITransactionResponse) => {
    const { menuItems } = useTransferActions(ref<ITransactionResponse | null>(tx));
    const item = menuItems.value.find((i) => i.label === "Revert Transfer") as { command: () => void } | undefined;
    item?.command();
};

describe("useTransferActions revert toast", () => {
    it("names the savings counterpart account instead of saying 'cash entry'", () => {
        revert(
            transfer({
                id: "c1",
                accountId: "a2",
                accountName: "Holiday Fund",
                accountType: "savings",
                amount: 100,
                currencyId: "cur1",
            }),
        );
        expect(toastAdd).toHaveBeenCalledWith(
            expect.objectContaining({
                detail: "Reverted to a regular transaction; the linked entry on Holiday Fund was removed",
            }),
        );
    });

    it("keeps the plain message when the transfer has no counterpart", () => {
        revert(transfer(null));
        expect(toastAdd).toHaveBeenCalledWith(expect.objectContaining({ detail: "Reverted to a regular transaction" }));
    });
});
