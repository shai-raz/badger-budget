import { browserLocalStorage } from "../devtoolsFlag";

// The id of the push subscription row this browser registered last. The next register sends it as `replacesId`, so a
// browser whose endpoint was replaced (or died) keeps its device, and the auto-sync grant on it, server-side.
// Cleared on every deliberate turn-off, so a browser with no subscription and no id stays off.
export const PUSH_SUBSCRIPTION_ID_KEY = "badger:push-subscription-id";

export interface PushIdStore {
    load(): string | null;
    save(id: string): void;
    clear(): void;
}

type IdStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** Never throws: blocked or missing storage reads as "no id" and drops writes. */
export function pushIdStore(storage: IdStorage | null = browserLocalStorage()): PushIdStore {
    return {
        load() {
            try {
                return storage?.getItem(PUSH_SUBSCRIPTION_ID_KEY) ?? null;
            } catch {
                return null;
            }
        },
        save(id) {
            try {
                storage?.setItem(PUSH_SUBSCRIPTION_ID_KEY, id);
            } catch {
                // Without it the next register is a plain one, as before.
            }
        },
        clear() {
            try {
                storage?.removeItem(PUSH_SUBSCRIPTION_ID_KEY);
            } catch {
                // Nothing stored that could be read either.
            }
        },
    };
}
