// Bank connection rules shared by the connection editor and the Bank connections page.
import { BANK_PROVIDERS } from "@badger/shared-data";
import type { BankProvider } from "@badger/shared-data";
import type { IScraperConnectionResponse } from "@badger/types";
import { formatTimeAgoCompact, isStale } from "./relativeTime";

/**
 * Only an edit opened from Update login, with changed credentials on an active connection, syncs after the save.
 * Name-only edits, paused connections and ⋮ Edit never sync.
 */
export function shouldAutoSyncAfterSave({
    updateLogin,
    credentialsChanged,
    isActive,
}: {
    updateLogin: boolean;
    credentialsChanged: boolean;
    isActive: boolean;
}): boolean {
    return updateLogin && credentialsChanged && isActive;
}

/** Display name of a bank provider; unknown ids fall back to the raw id. */
export function providerName(companyId: string): string {
    return BANK_PROVIDERS.find((p: BankProvider) => p.companyId === companyId)?.name ?? companyId;
}

export interface ConnectionSubtitleParts {
    provider: string;
    /** "Synced 3h ago", or "Never synced". */
    syncAge: string;
    /** The last sync is older than the staleness threshold; never-synced connections are not stale. */
    stale: boolean;
}

/** The gray line under a connection's name, split into provider, compact sync age and staleness. */
export function connectionSubtitle(
    connection: Pick<IScraperConnectionResponse, "companyId" | "lastSyncedAt">,
    now: Date,
): ConnectionSubtitleParts {
    const { lastSyncedAt } = connection;
    return {
        provider: providerName(connection.companyId),
        syncAge: lastSyncedAt ? `Synced ${formatTimeAgoCompact(lastSyncedAt, now)}` : "Never synced",
        stale: lastSyncedAt ? isStale(lastSyncedAt, now) : false,
    };
}
