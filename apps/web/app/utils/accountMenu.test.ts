import type { IAccountResponse } from "@badger/types";
import type { MenuItem } from "primevue/menuitem";
import { describe, expect, it, vi } from "vitest";
import { buildAccountMenuItems, type AccountMenuActions } from "./accountMenu";

const NOW = new Date("2026-06-15T12:00:00");

function account(overrides: Partial<IAccountResponse> & { id: string; name: string }): IAccountResponse {
    return {
        accountNumber: null,
        hiddenOnOverview: false,
        type: "bank",
        icon: null,
        color: null,
        currencyId: "ILS",
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
        createdAt: NOW,
        updatedAt: NOW,
        ...overrides,
    };
}

function actions(): AccountMenuActions {
    return {
        edit: vi.fn(),
        updateBalance: vi.fn(),
        toggleOverview: vi.fn(),
        remove: vi.fn(),
    };
}

/** The item at `index`; fails the test when the menu is shorter than expected. */
function itemAt(items: MenuItem[], index: number): MenuItem {
    const item = items[index];
    if (!item) throw new Error(`no menu item at index ${index}`);
    return item;
}

describe("buildAccountMenuItems", () => {
    it("lists Hide on Overview with the eye-slash icon for a shown bank account", () => {
        const items = buildAccountMenuItems(account({ id: "1", name: "Checking" }), actions());

        expect(items.map((item) => item.label)).toEqual(["Edit", "Hide on Overview", "Delete"]);
        expect(itemAt(items, 1).icon).toBe("pi pi-eye-slash");
    });

    it("lists Show on Overview with the eye icon for a hidden bank account", () => {
        const items = buildAccountMenuItems(account({ id: "1", name: "Checking", hiddenOnOverview: true }), actions());

        expect(items.map((item) => item.label)).toEqual(["Edit", "Show on Overview", "Delete"]);
        expect(itemAt(items, 1).icon).toBe("pi pi-eye");
    });

    it("places the toggle after Update balance for a ledger account", () => {
        const items = buildAccountMenuItems(account({ id: "2", name: "Wallet", type: "cash" }), actions());

        expect(items.map((item) => item.label)).toEqual(["Edit", "Update balance", "Hide on Overview", "Delete"]);
    });

    it("keeps Delete last with the rose text class", () => {
        const items = buildAccountMenuItems(account({ id: "2", name: "Wallet", type: "savings" }), actions());
        const last = itemAt(items, items.length - 1);

        expect(last.label).toBe("Delete");
        expect(last.class).toBe("text-rose-500");
    });

    it("calls toggleOverview with the account when the toggle item runs", () => {
        const menuActions = actions();
        const checking = account({ id: "1", name: "Checking" });
        const items = buildAccountMenuItems(checking, menuActions);

        itemAt(items, 1).command?.({} as never);

        expect(menuActions.toggleOverview).toHaveBeenCalledWith(checking);
    });

    it("calls toggleOverview for a hidden account too", () => {
        const menuActions = actions();
        const hidden = account({ id: "1", name: "Checking", hiddenOnOverview: true });
        const items = buildAccountMenuItems(hidden, menuActions);

        itemAt(items, 1).command?.({} as never);

        expect(menuActions.toggleOverview).toHaveBeenCalledWith(hidden);
    });

    it("keeps Delete disabled with a tooltip for a ledger account with linked transfers", () => {
        const items = buildAccountMenuItems(
            account({ id: "2", name: "Wallet", type: "cash", hasLinkedTransfers: true }),
            actions(),
        );
        const del = itemAt(items, items.length - 1);

        expect(del.disabled).toBe(true);
        expect(del.tooltip).toBeTruthy();
    });

    it("leaves Delete enabled for a bank account even with the linked-transfers flag", () => {
        const items = buildAccountMenuItems(
            account({ id: "1", name: "Checking", hasLinkedTransfers: true }),
            actions(),
        );
        const del = itemAt(items, items.length - 1);

        expect(del.disabled).toBe(false);
        expect(del.tooltip).toBeUndefined();
    });
});
