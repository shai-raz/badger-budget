import { fromBase64Url, toBase64Url } from "./base64url";

export const SYNC_PASSKEY_HKDF_INFO = "badger-sync-passkey-v1";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function randomBytes(n: number): Uint8Array {
    return crypto.getRandomValues(new Uint8Array(n));
}

export async function deriveWrappingKey(prfOutput: Uint8Array, prfSalt: Uint8Array): Promise<CryptoKey> {
    if (prfOutput.byteLength !== 32) throw new Error("PRF output must be 32 bytes");
    const base = await crypto.subtle.importKey("raw", prfOutput as BufferSource, "HKDF", false, ["deriveKey"]);
    return crypto.subtle.deriveKey(
        {
            name: "HKDF",
            hash: "SHA-256",
            salt: prfSalt as BufferSource,
            info: encoder.encode(SYNC_PASSKEY_HKDF_INFO),
        },
        base,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"],
    );
}

export async function wrapPin(
    pin: string,
    prfOutput: Uint8Array,
    prfSalt: Uint8Array,
    credentialId: string,
): Promise<{ wrappedPinCt: string; wrappedPinIv: string }> {
    const key = await deriveWrappingKey(prfOutput, prfSalt);
    const iv = randomBytes(12);
    const ct = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv: iv as BufferSource, additionalData: encoder.encode(credentialId) },
        key,
        encoder.encode(pin),
    );
    return { wrappedPinCt: toBase64Url(ct), wrappedPinIv: toBase64Url(iv) };
}

export async function unwrapPin(
    blob: { wrappedPinCt: string; wrappedPinIv: string },
    prfOutput: Uint8Array,
    prfSalt: Uint8Array,
    credentialId: string,
): Promise<string> {
    const key = await deriveWrappingKey(prfOutput, prfSalt);
    const pt = await crypto.subtle.decrypt(
        {
            name: "AES-GCM",
            iv: fromBase64Url(blob.wrappedPinIv) as BufferSource,
            additionalData: encoder.encode(credentialId),
        },
        key,
        fromBase64Url(blob.wrappedPinCt) as BufferSource,
    );
    return decoder.decode(pt);
}
