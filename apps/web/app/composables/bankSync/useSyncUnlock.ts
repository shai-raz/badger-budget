import { useQueryClient } from "@tanstack/vue-query";
import type { ISyncPasskey } from "@badger/types";
import { useApiClient } from "../useApiClient";
import { useAuthStore } from "../../stores/auth";
import { bankSyncKeys } from "./useBankSync";
import { fromBase64Url, toBase64Url } from "../../utils/base64url";
import { unwrapPin, wrapPin } from "../../utils/syncPasskeyCrypto";
import { describeDevice } from "../../utils/deviceLabel";
import { markRegisteredOnDevice } from "../../utils/syncPasskeyDeviceFlags";
import {
    SyncUnlockError,
    UNSUPPORTED_MESSAGE,
    createPrfPasskey,
    getPrfOutputForAny,
    signalUnknown,
    toSyncUnlockError,
} from "../../utils/syncPasskeyWebAuthn";

export { SyncUnlockError };
export type { SyncUnlockErrorReason } from "../../utils/syncPasskeyWebAuthn";

function isApiError(err: unknown): boolean {
    return typeof err === "object" && err !== null && !!(err as { response?: unknown }).response;
}

export function useSyncUnlock() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    const authStore = useAuthStore();

    function isWebAuthnAvailable(): boolean {
        return (
            typeof window !== "undefined" &&
            window.isSecureContext &&
            !!window.PublicKeyCredential &&
            !!navigator.credentials
        );
    }

    async function isPlatformAuthenticatorAvailable(): Promise<boolean> {
        try {
            return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
        } catch {
            return false;
        }
    }

    function fetchPasskeys(): Promise<ISyncPasskey[]> {
        return queryClient.fetchQuery({
            queryKey: bankSyncKeys.passkeys(),
            queryFn: (): Promise<ISyncPasskey[]> => apiClient.getSyncPasskeys(),
            staleTime: 30_000,
        });
    }

    /** Pass an already-loaded list so credentials.create is the first await after the user's click (Safari activation). */
    async function register(pin: string, known?: ISyncPasskey[]): Promise<ISyncPasskey> {
        if (!isWebAuthnAvailable()) throw new SyncUnlockError("unsupported", UNSUPPORTED_MESSAGE);
        let prfOutput: Uint8Array | undefined;
        try {
            const user = authStore.user;
            if (!user) throw new SyncUnlockError("failed");
            const fullName = `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim();
            const existing = known ?? (await fetchPasskeys());
            const created = await createPrfPasskey(navigator.credentials, {
                userId: user.id,
                userName: user.email,
                displayName: fullName || user.email,
                excludeCredentialIds: existing.map((p) => p.credentialId),
            });
            prfOutput = created.prfOutput;
            let row: ISyncPasskey;
            try {
                const wrapped = await wrapPin(pin, prfOutput, created.prfSalt, created.credentialId);
                row = await apiClient.registerSyncPasskey({
                    pin,
                    credentialId: created.credentialId,
                    prfSalt: toBase64Url(created.prfSalt),
                    ...wrapped,
                    label: describeDevice(navigator.userAgent),
                });
            } catch (err) {
                // The credential exists on the device but the server never stored it.
                signalUnknown(created.credentialId);
                throw err;
            }
            markRegisteredOnDevice(user.id);
            await queryClient.invalidateQueries({ queryKey: bankSyncKeys.passkeys() });
            return row;
        } catch (err) {
            // API errors (401 wrong PIN, 400 limit, 409 duplicate) must reach the caller with their response intact.
            if (isApiError(err)) throw err;
            throw toSyncUnlockError(err);
        } finally {
            prfOutput?.fill(0);
        }
    }

    /** Pass an already-loaded list so credentials.get is the first await after the user's click (Safari activation). */
    async function unlock(known?: ISyncPasskey[]): Promise<string> {
        if (!isWebAuthnAvailable()) throw new SyncUnlockError("unsupported", UNSUPPORTED_MESSAGE);
        let prfOutput: Uint8Array | undefined;
        try {
            const passkeys = known ?? (await fetchPasskeys());
            if (passkeys.length === 0) throw new SyncUnlockError("no-passkeys");
            const result = await getPrfOutputForAny(navigator.credentials, passkeys);
            prfOutput = result.prfOutput;
            const row = passkeys.find((p) => p.credentialId === result.credentialId);
            if (!row) throw new SyncUnlockError("failed");
            try {
                return await unwrapPin(row, prfOutput, fromBase64Url(row.prfSalt), row.credentialId);
            } catch (err) {
                throw new SyncUnlockError("failed", undefined, { cause: err });
            }
        } catch (err) {
            throw toSyncUnlockError(err);
        } finally {
            prfOutput?.fill(0);
        }
    }

    return { isWebAuthnAvailable, isPlatformAuthenticatorAvailable, fetchPasskeys, register, unlock };
}
