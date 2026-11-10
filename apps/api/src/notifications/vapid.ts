import { createECDH } from "crypto";

export const DEFAULT_VAPID_SUBJECT = "https://github.com/shai-raz/badger-budget";

export interface VapidConfig {
    publicKey: string;
    privateKey: string;
    subject: string;
}

const INVALID_KEY_MESSAGE =
    "VAPID_PRIVATE_KEY is not a valid P-256 private key (base64url, 32 bytes). Fix it, or remove it from the environment and DATA_DIR/secrets to generate a new one (every device then has to turn notifications on again).";

/** Hostnames that cannot be a real public origin, so they fall back to the project subject. */
const LOCAL_HOSTNAME = /^(localhost|127\.0\.0\.1|\[::1\])$|\.(localhost|local)$/;

/** Derives the uncompressed P-256 public key (base64url, 65 bytes) that matches a base64url private key. */
export function deriveVapidPublicKey(privateKey: string): string {
    const bytes = Buffer.from(privateKey, "base64url");
    if (bytes.length !== 32) throw new Error(INVALID_KEY_MESSAGE);

    try {
        const ecdh = createECDH("prime256v1");
        ecdh.setPrivateKey(bytes);
        return ecdh.getPublicKey().toString("base64url");
    } catch {
        throw new Error(INVALID_KEY_MESSAGE);
    }
}

/**
 * The VAPID subject is a contact URI that push services see. Apple's service rejects fake-looking subjects
 * (localhost, example) with 403 BadJwtToken, so the fallback is the project URL, not PUBLIC_URL on a dev host.
 */
export function resolveVapidSubject(env: NodeJS.ProcessEnv): string {
    const explicit = env.VAPID_SUBJECT?.trim();
    if (explicit) {
        if (!explicit.startsWith("mailto:") && !explicit.startsWith("https:")) {
            throw new Error("VAPID_SUBJECT must start with mailto: or https:");
        }
        return explicit;
    }

    const publicUrl = env.PUBLIC_URL?.trim();
    if (publicUrl) {
        try {
            const url = new URL(publicUrl);
            if (url.protocol === "https:" && !LOCAL_HOSTNAME.test(url.hostname)) return url.origin;
        } catch {
            // Not a URL: use the default subject below.
        }
    }

    return DEFAULT_VAPID_SUBJECT;
}

export function resolveVapidConfig(env: NodeJS.ProcessEnv): VapidConfig {
    const privateKey = env.VAPID_PRIVATE_KEY?.trim();
    if (!privateKey) throw new Error(INVALID_KEY_MESSAGE);

    return {
        publicKey: deriveVapidPublicKey(privateKey),
        privateKey,
        subject: resolveVapidSubject(env),
    };
}
