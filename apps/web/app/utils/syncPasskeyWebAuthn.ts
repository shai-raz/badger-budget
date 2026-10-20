import { fromBase64Url, toBase64Url } from "./base64url";
import { randomBytes } from "./syncPasskeyCrypto";

export type SyncUnlockErrorReason =
    | "cancelled"
    | "unsupported"
    | "no-passkeys"
    | "already-registered"
    | "stale-pin"
    | "failed";

export class SyncUnlockError extends Error {
    constructor(
        public readonly reason: SyncUnlockErrorReason,
        message?: string,
        options?: { cause?: unknown },
    ) {
        super(message ?? reason, options);
        this.name = "SyncUnlockError";
    }
}

export const UNSUPPORTED_MESSAGE = "This device's passkeys can't be used for sync unlock.";

export const STALE_PIN_MESSAGE = "Your passkey unlock is out of date. Enter your PIN.";

/**
 * Text for the PIN fallback when an unlock attempt fails, or null when the error should surface as a toast instead.
 * `pinFromPasskey` marks that the PIN came from a passkey, so a server 401 means the stored wrap is stale.
 */
export function unlockFallbackMessage(err: unknown, pinFromPasskey: boolean): string | null {
    if (err instanceof SyncUnlockError) {
        switch (err.reason) {
            case "unsupported":
                return UNSUPPORTED_MESSAGE;
            case "failed":
                return "Couldn't unlock with passkey.";
            case "stale-pin":
                return STALE_PIN_MESSAGE;
            default:
                return "Passkey cancelled or not available on this device.";
        }
    }
    const status = (err as { response?: { status?: number } } | null)?.response?.status;
    if (pinFromPasskey && status === 401) return STALE_PIN_MESSAGE;
    return null;
}

export function toSyncUnlockError(err: unknown): SyncUnlockError {
    if (err instanceof SyncUnlockError) return err;
    const name = (err as { name?: unknown } | null)?.name;
    const message = err instanceof Error ? err.message : undefined;
    const cause = { cause: err };
    switch (name) {
        case "NotAllowedError":
        case "AbortError":
            return new SyncUnlockError("cancelled", message, cause);
        case "InvalidStateError":
            return new SyncUnlockError("already-registered", message, cause);
        case "NotSupportedError":
        case "SecurityError":
            return new SyncUnlockError("unsupported", message, cause);
        default:
            return new SyncUnlockError("failed", message, cause);
    }
}

function toBytes(buf: BufferSource): Uint8Array {
    if (buf instanceof ArrayBuffer) return new Uint8Array(buf);
    return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
}

interface PrfExtensionOutput {
    enabled?: boolean;
    results?: { first?: BufferSource };
}

function prfOf(cred: PublicKeyCredential): PrfExtensionOutput | undefined {
    return (cred.getClientExtensionResults() as unknown as { prf?: PrfExtensionOutput }).prf;
}

function bs(bytes: Uint8Array): BufferSource {
    return bytes as unknown as BufferSource;
}

export function signalUnknown(credentialId: string): void {
    try {
        if (typeof PublicKeyCredential === "undefined") return;
        const pkc = PublicKeyCredential as unknown as {
            signalUnknownCredential?: (opts: { rpId: string; credentialId: string }) => Promise<void> | undefined;
        };
        const fn = pkc.signalUnknownCredential;
        if (typeof fn !== "function") return;
        const result = fn.call(PublicKeyCredential, { rpId: location.hostname, credentialId });
        if (result && typeof result.catch === "function") result.catch(() => {});
    } catch {
        // best effort
    }
}

export async function createPrfPasskey(
    creds: CredentialsContainer,
    opts: { userId: string; userName: string; displayName: string; excludeCredentialIds: string[] },
): Promise<{ credentialId: string; prfSalt: Uint8Array; prfOutput: Uint8Array }> {
    let credentialId: string | undefined;
    try {
        const prfSalt = randomBytes(32);
        const cred = (await creds.create({
            publicKey: {
                rp: { name: "Badger Budget" },
                user: {
                    id: bs(new TextEncoder().encode(opts.userId)),
                    name: opts.userName,
                    displayName: opts.displayName,
                },
                challenge: bs(randomBytes(32)),
                pubKeyCredParams: [
                    { type: "public-key", alg: -7 },
                    { type: "public-key", alg: -257 },
                ],
                authenticatorSelection: {
                    authenticatorAttachment: "platform",
                    residentKey: "preferred",
                    userVerification: "required",
                },
                excludeCredentials: opts.excludeCredentialIds.map((id) => ({
                    type: "public-key" as const,
                    id: bs(fromBase64Url(id)),
                })),
                extensions: { prf: { eval: { first: bs(prfSalt) } } } as AuthenticationExtensionsClientInputs,
            },
        })) as PublicKeyCredential | null;
        if (!cred) throw new SyncUnlockError("cancelled");

        credentialId = toBase64Url(cred.rawId);
        const prf = prfOf(cred);

        let first: BufferSource | undefined = prf?.results?.first;
        if (!first && prf?.enabled === true) {
            const assertion = (await creds.get({
                publicKey: {
                    challenge: bs(randomBytes(32)),
                    allowCredentials: [{ type: "public-key", id: cred.rawId }],
                    userVerification: "required",
                    extensions: { prf: { eval: { first: bs(prfSalt) } } } as AuthenticationExtensionsClientInputs,
                },
            })) as PublicKeyCredential | null;
            if (!assertion) throw new SyncUnlockError("cancelled");
            first = prfOf(assertion)?.results?.first;
        }

        const prfOutput = first ? toBytes(first) : undefined;
        if (!prfOutput || prfOutput.length !== 32) {
            throw new SyncUnlockError("unsupported", UNSUPPORTED_MESSAGE);
        }
        return { credentialId, prfSalt, prfOutput };
    } catch (err) {
        // The credential may already exist on the authenticator but the server never learned its id;
        // signalUnknown is idempotent and best-effort, so always call it once we have an id.
        if (credentialId) signalUnknown(credentialId);
        throw toSyncUnlockError(err);
    }
}

export async function getPrfOutputForAny(
    creds: CredentialsContainer,
    passkeys: Array<{ credentialId: string; prfSalt: string }>,
): Promise<{ credentialId: string; prfOutput: Uint8Array }> {
    if (passkeys.length === 0) throw new SyncUnlockError("no-passkeys");
    try {
        const assertion = (await creds.get({
            publicKey: {
                challenge: bs(randomBytes(32)),
                allowCredentials: passkeys.map((p) => ({
                    type: "public-key" as const,
                    id: bs(fromBase64Url(p.credentialId)),
                })),
                userVerification: "required",
                extensions: {
                    prf: {
                        evalByCredential: Object.fromEntries(
                            passkeys.map((p) => [p.credentialId, { first: bs(fromBase64Url(p.prfSalt)) }]),
                        ),
                    },
                } as AuthenticationExtensionsClientInputs,
            },
        })) as PublicKeyCredential | null;
        if (!assertion) throw new SyncUnlockError("cancelled");

        const credentialId = toBase64Url(assertion.rawId);
        if (!passkeys.some((p) => p.credentialId === credentialId)) throw new SyncUnlockError("failed");
        const first = prfOf(assertion)?.results?.first;
        if (!first) throw new SyncUnlockError("unsupported", UNSUPPORTED_MESSAGE);
        return { credentialId, prfOutput: toBytes(first) };
    } catch (err) {
        throw toSyncUnlockError(err);
    }
}
