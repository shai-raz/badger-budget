// Per-user settings (User.settings JSONB). Adding a setting = a key here + its field on IUserSettings in @badger/types.
export const UNMATCHED_IMPORT_CATEGORY_MODES = ["create_or_reuse", "reuse_only", "uncategorized"] as const;
export type UnmatchedImportCategoryMode = (typeof UNMATCHED_IMPORT_CATEGORY_MODES)[number];
export const DEFAULT_UNMATCHED_IMPORT_CATEGORY: UnmatchedImportCategoryMode = "create_or_reuse";

export function isUnmatchedImportCategoryMode(value: unknown): value is UnmatchedImportCategoryMode {
    return typeof value === "string" && (UNMATCHED_IMPORT_CATEGORY_MODES as readonly string[]).includes(value);
}

/** Serialized size cap of User.settings, enforced by the API merge (AuthService.updateSettings). */
export const USER_SETTINGS_MAX_BYTES = 1024;
