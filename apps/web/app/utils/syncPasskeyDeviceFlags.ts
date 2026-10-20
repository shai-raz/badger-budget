const registeredKey = (userId: string) => `badger:syncPasskey:registered:${userId}`;
const dismissedKey = (userId: string) => `badger:syncPasskey:offerDismissed:${userId}`;

function read(key: string): boolean {
    try {
        return globalThis.localStorage?.getItem(key) === "1";
    } catch {
        return false;
    }
}

function write(key: string): void {
    try {
        globalThis.localStorage?.setItem(key, "1");
    } catch {
        // storage unavailable
    }
}

export const hasRegisteredOnDevice = (userId: string): boolean => read(registeredKey(userId));
export const markRegisteredOnDevice = (userId: string): void => write(registeredKey(userId));
export const isOfferDismissed = (userId: string): boolean => read(dismissedKey(userId));
export const markOfferDismissed = (userId: string): void => write(dismissedKey(userId));
