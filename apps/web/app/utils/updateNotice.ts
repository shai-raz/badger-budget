import type { ISystemInfo } from "@badger/types";
import type { UpgradePhase } from "./upgradeTracking";

/** The update notice shows only for a newer release this browser has not dismissed yet. */
export function isUpdateNoticeVisible(info: ISystemInfo | undefined | null, dismissedVersion: string | null): boolean {
    return !!info?.updateAvailable && !!info.latest && info.latest !== dismissedVersion;
}

/** Hamburger button label; screen readers hear the badge as part of the name. */
export function hamburgerLabel(visible: boolean, phase: UpgradePhase | null = null): string {
    switch (phase) {
        case "upgrading":
            return "Open menu, upgrading";
        case "ready":
            return "Open menu, new version ready";
        case "stalled":
            return "Open menu, upgrade stalled";
        default:
            return visible ? "Open menu, update available" : "Open menu";
    }
}

/** Upgrade instructions linked from the update dialog. */
export const UPGRADE_GUIDE_URL = "https://github.com/shai-raz/badger-budget/blob/main/README.md#upgrading";
export const RESTORE_GUIDE_URL = "https://github.com/shai-raz/badger-budget/blob/main/README.md#restore-the-database";
