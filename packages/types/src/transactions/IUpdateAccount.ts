import type { AccountType, AvatarIconName } from "@badger/shared-data";

export interface IUpdateAccount {
    name?: string;
    type?: AccountType;
    icon?: AvatarIconName | null;
    color?: string;
    currencyId?: string;
    /** Hide the account's card from Overview's Accounts section (display only). */
    hiddenOnOverview?: boolean;
}
