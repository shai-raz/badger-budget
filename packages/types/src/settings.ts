/** GET /api/v1/settings/summary: counts shown as subtitles on the Settings page. */
export interface ISettingsSummary {
    /** The user's own categories (not system ones), excluding soft-deleted. */
    categories: number;
    /** The user's rules, excluding soft-deleted. */
    rules: number;
    /** Card payoff patterns the Card payoff patterns page lists: system ones plus the user's own. */
    cardPayoffPatterns: number;
    /** The user's sync passkeys. */
    passkeys: number;
    /** Client names of the user's active (unrevoked) OAuth grants, newest first, de-duplicated. */
    connectedApps: string[];
}
