// Bank connection rules shared by the connection editor and the Bank connections page.

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
