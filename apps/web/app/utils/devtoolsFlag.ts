// Developer options are gated by a per-browser flag. `?devtools=1` turns it on and `?devtools=0` turns it off;
// any other value leaves it as it is.
export const DEVTOOLS_STORAGE_KEY = "badger:devtools";

type FlagStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** The browser's localStorage, or null where it is absent or blocked (SSR, some private windows). */
export function browserLocalStorage(): Storage | null {
    try {
        return globalThis.localStorage ?? null;
    } catch {
        return null;
    }
}

export function readDevtoolsFlag(storage: FlagStorage | null | undefined): boolean {
    try {
        return storage?.getItem(DEVTOOLS_STORAGE_KEY) === "1";
    } catch {
        return false;
    }
}

/** Applies `?devtools=` from a route query. Returns the new flag, or null when the query asks for no change. */
export function applyDevtoolsQuery(query: unknown, storage: FlagStorage | null | undefined): boolean | null {
    const value = typeof query === "object" && query !== null ? (query as Record<string, unknown>).devtools : undefined;
    if (value !== "1" && value !== "0") return null;

    const enabled = value === "1";
    try {
        if (enabled) storage?.setItem(DEVTOOLS_STORAGE_KEY, "1");
        else storage?.removeItem(DEVTOOLS_STORAGE_KEY);
    } catch {
        // storage unavailable: the flag still applies for this page session
    }
    return enabled;
}
