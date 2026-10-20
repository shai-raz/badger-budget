// Latest bank-sync timestamp across a set of connections, for the header's "Synced N ago" label.

/** Newest non-null `lastSyncedAt` across the connections, or null when none has synced. */
export function latestSyncedAt(
    connections: ReadonlyArray<{ lastSyncedAt: Date | string | null }> | undefined | null,
): Date | null {
    let latest: number | null = null;

    for (const connection of connections ?? []) {
        if (connection.lastSyncedAt === null) continue;
        const time = new Date(connection.lastSyncedAt).getTime();
        if (latest === null || time > latest) latest = time;
    }

    return latest === null ? null : new Date(latest);
}
