import type { IAccountResponse } from "@badger/types";
import { isLedgerAccountType } from "@badger/shared-data";
import type { MenuItem } from "primevue/menuitem";

export interface AccountMenuActions {
    edit: (account: IAccountResponse) => void;
    updateBalance: (account: IAccountResponse) => void;
    toggleOverview: (account: IAccountResponse) => void;
    remove: (account: IAccountResponse) => void;
}

/** The ⋮ menu items for one account on the Accounts page. */
export function buildAccountMenuItems(account: IAccountResponse, actions: AccountMenuActions): MenuItem[] {
    // An account with linked transfers can't be deleted until those transfers are reverted or re-pointed.
    const deleteBlocked = isLedgerAccountType(account.type) && account.hasLinkedTransfers;
    return [
        {
            label: "Edit",
            icon: "pi pi-pencil",
            command: () => actions.edit(account),
        },
        ...(isLedgerAccountType(account.type)
            ? [
                  {
                      label: "Update balance",
                      icon: "pi pi-wallet",
                      command: () => actions.updateBalance(account),
                  },
              ]
            : []),
        account.hiddenOnOverview
            ? {
                  label: "Show on Overview",
                  icon: "pi pi-eye",
                  command: () => actions.toggleOverview(account),
              }
            : {
                  label: "Hide on Overview",
                  icon: "pi pi-eye-slash",
                  command: () => actions.toggleOverview(account),
              },
        {
            label: "Delete",
            icon: "pi pi-trash",
            class: "text-rose-500",
            command: () => actions.remove(account),
            disabled: deleteBlocked,
            ...(deleteBlocked
                ? {
                      tooltip: "This account has linked transfers. Revert or re-point them before deleting it.",
                  }
                : {}),
        },
    ];
}
