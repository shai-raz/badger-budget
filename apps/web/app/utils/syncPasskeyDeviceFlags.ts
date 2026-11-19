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

const deviceCredentialKey = (userId: string) => `badger:syncPasskey:credential:${userId}`;

// The credential id of the passkey this device registered or last unlocked with, for the "This device" tag.
export function getDeviceCredentialId(userId: string): string | null {
    try {
        return globalThis.localStorage?.getItem(deviceCredentialKey(userId)) ?? null;
    } catch {
        return null;
    }
}

export function setDeviceCredentialId(userId: string, credentialId: string): void {
    try {
        globalThis.localStorage?.setItem(deviceCredentialKey(userId), credentialId);
    } catch {
        // storage unavailable
    }
}

export function clearDeviceCredentialId(userId: string): void {
    try {
        globalThis.localStorage?.removeItem(deviceCredentialKey(userId));
    } catch {
        // storage unavailable
    }
}
