// Bank connection rules shared by the connection editor and the Bank connections page.
import { BANK_PROVIDERS } from "@badger/shared-data";
import type { BankProvider } from "@badger/shared-data";
import type { IScraperConnectionResponse } from "@badger/types";

/** A credential change on an active connection syncs it straight after the save. Name-only edits and paused connections never do. */
export function shouldAutoSyncAfterSave({
    credentialsChanged,
    isActive,
}: {
    credentialsChanged: boolean;
    isActive: boolean;
}): boolean {
    return credentialsChanged && isActive;
}

/** Display name of a bank provider; unknown ids fall back to the raw id. */
export function providerName(companyId: string): string {
    return BANK_PROVIDERS.find((p: BankProvider) => p.companyId === companyId)?.name ?? companyId;
}

/** The gray line under a connection's name: provider and last sync time. */
export function connectionSubtitle(
    connection: Pick<IScraperConnectionResponse, "companyId" | "lastSyncedAt">,
    formatDate: (d: Date) => string,
): string {
    const name = providerName(connection.companyId);
    const synced = connection.lastSyncedAt ? `Last synced ${formatDate(connection.lastSyncedAt)}` : "Never synced";
    return `${name} · ${synced}`;
}
