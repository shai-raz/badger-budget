import { createHash, randomBytes, timingSafeEqual } from "crypto";

export type SecretPrefix = "bdg_at" | "bdg_rt" | "bdg_ac" | "bdg_ar";

export function generateSecret(prefix: SecretPrefix): string {
    return `${prefix}_${randomBytes(32).toString("base64url")}`;
}

export function generateClientId(): string {
    return "mcp_" + randomBytes(16).toString("base64url");
}

export function sha256Hex(s: string): string {
    return createHash("sha256").update(s).digest("hex");
}

export function safeEqual(a: string, b: string): boolean {
    const ba = Buffer.from(a);
    const bb = Buffer.from(b);
    if (ba.length !== bb.length) return false;
    return timingSafeEqual(ba, bb);
}

const VERIFIER_RE = /^[A-Za-z0-9\-._~]{43,128}$/;
const CHALLENGE_RE = /^[A-Za-z0-9_-]{43}$/;

export function verifyPkceS256(verifier: string, challenge: string): boolean {
    if (!VERIFIER_RE.test(verifier)) return false;
    const computed = createHash("sha256").update(verifier).digest("base64url");
    return safeEqual(computed, challenge);
}

export function isValidCodeChallenge(c: string): boolean {
    return CHALLENGE_RE.test(c);
}
