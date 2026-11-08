import type { ColorThemeName, UnmatchedImportCategoryMode } from "@badger/shared-data";

/** Application role of a user. ADMIN is granted by the backfill and the create rule (see api auth). */
export type UserRole = "USER" | "ADMIN";

/** The signed-in user as returned by the auth endpoints. */
export interface IAuthUser {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: UserRole;
    /** Account colour theme; null = default (Noir). */
    colorTheme: ColorThemeName | null;
    /** The shared demo account: the web keeps its theme on the device only. */
    isDemo: boolean;
}

/** Body of PATCH /auth/me. Omitted fields are left unchanged. */
export interface IUpdateMeRequest {
    colorTheme?: ColorThemeName | null;
}

/** Per-user settings. Always fully resolved (defaults filled) by the API. */
export interface IUserSettings {
    /** How an import's unmatched category is resolved: create or reuse one, reuse only, or leave uncategorized. */
    unmatchedImportCategory: UnmatchedImportCategoryMode;
}

/** Body of PATCH /auth/me/settings. Omitted fields are left unchanged. */
export type IUpdateUserSettingsRequest = Partial<IUserSettings>;

/** Login, register and refresh responses. */
export interface IAuthResponse {
    accessToken: string;
    refreshToken: string;
    user: IAuthUser;
}
