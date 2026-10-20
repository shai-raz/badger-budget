import type { IAppConfigResponse } from "@badger/types";

/** Show the register link only once the config confirms registration is open (hidden while loading or on error). */
export function canShowRegister(config: IAppConfigResponse | undefined): boolean {
    return config?.registrationOpen === true;
}

/** Leave /auth/register only after the config has loaded and says registration is closed. */
export function shouldLeaveRegisterPage(config: IAppConfigResponse | undefined): boolean {
    return config !== undefined && !config.registrationOpen;
}

/** Run the Google Sheets sync only for a signed-in user on an instance where Sheets is configured. */
export function shouldSyncGoogleSheet(config: IAppConfigResponse | undefined, isAuthenticated: boolean): boolean {
    return isAuthenticated && config?.googleSheetsEnabled === true;
}
