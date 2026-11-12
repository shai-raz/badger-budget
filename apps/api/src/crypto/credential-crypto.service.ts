import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as crypto from "crypto";
import { AUTO_SYNC_KEY_BYTES } from "@badger/shared-data";

const VERIFIER_PLAINTEXT = "badger-sync-pin-verifier-v1";
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 };
const KEY_LEN = 32;
const GRANT_HKDF_INFO_PREFIX = "badger-auto-sync-v1:";
const GRANT_KEY_CHECK_PLAINTEXT = "badger-auto-sync-key-check-v1";
// Pin the GCM tag length: Node accepts truncated tags (4-16 bytes) unless told otherwise.
const GRANT_AUTH_TAG_BYTES = 16;

export interface EncryptedBlob {
    ciphertext: string; // base64
    iv: string; // base64
    authTag: string; // base64
    salt: string; // hex
}

export interface GrantBlob {
    ciphertext: string; // base64
    iv: string; // base64
    authTag: string; // base64
}

export class GrantDecryptError extends Error {
    constructor() {
        super("Auto-sync credentials could not be decrypted");
        this.name = "GrantDecryptError";
    }
}

@Injectable()
export class CredentialCryptoService {
    private readonly pepper: string;

    constructor(private configService: ConfigService) {
        // Keep the value as-is (untrimmed) so existing ciphertexts stay decryptable; only blank is rejected.
        const pepper = this.configService.get<string>("CREDENTIAL_ENCRYPTION_PEPPER") ?? "";
        if (!pepper.trim()) {
            throw new Error("CREDENTIAL_ENCRYPTION_PEPPER is not set");
        }
        this.pepper = pepper;
    }

    private deriveKey(pin: string, salt: Buffer): Buffer {
        return crypto.scryptSync(pin + this.pepper, salt, KEY_LEN, SCRYPT_PARAMS);
    }

    encrypt(plaintext: string, pin: string): EncryptedBlob {
        const salt = crypto.randomBytes(16);
        const iv = crypto.randomBytes(12);
        const key = this.deriveKey(pin, salt);
        const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
        const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
        return {
            ciphertext: ct.toString("base64"),
            iv: iv.toString("base64"),
            authTag: cipher.getAuthTag().toString("base64"),
            salt: salt.toString("hex"),
        };
    }

    decrypt(blob: EncryptedBlob, pin: string): string {
        const salt = Buffer.from(blob.salt, "hex");
        const iv = Buffer.from(blob.iv, "base64");
        const key = this.deriveKey(pin, salt);
        const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
        decipher.setAuthTag(Buffer.from(blob.authTag, "base64"));
        try {
            const pt = Buffer.concat([decipher.update(Buffer.from(blob.ciphertext, "base64")), decipher.final()]);
            return pt.toString("utf8");
        } catch {
            throw new UnauthorizedException("Invalid PIN");
        }
    }

    createVerifier(pin: string): EncryptedBlob {
        return this.encrypt(VERIFIER_PLAINTEXT, pin);
    }

    verifyPin(blob: EncryptedBlob, pin: string): void {
        // Throws UnauthorizedException if PIN is wrong (GCM auth tag fails)
        const result = this.decrypt(blob, pin);
        if (result !== VERIFIER_PLAINTEXT) {
            throw new UnauthorizedException("Invalid PIN");
        }
    }

    deriveGrantKey(key: Buffer, grantId: string): Buffer {
        if (key.length !== AUTO_SYNC_KEY_BYTES) {
            throw new GrantDecryptError();
        }
        return Buffer.from(
            crypto.hkdfSync("sha256", key, Buffer.from(this.pepper, "utf8"), GRANT_HKDF_INFO_PREFIX + grantId, KEY_LEN),
        );
    }

    encryptForGrant(plaintext: string, grantKey: Buffer, grantId: string, connectionId: string): GrantBlob {
        return this.encryptWithAad(plaintext, grantKey, `${grantId}:${connectionId}`);
    }

    decryptForGrant(blob: GrantBlob, grantKey: Buffer, grantId: string, connectionId: string): string {
        return this.decryptWithAad(blob, grantKey, `${grantId}:${connectionId}`);
    }

    createGrantKeyCheck(grantKey: Buffer, grantId: string): GrantBlob {
        return this.encryptWithAad(GRANT_KEY_CHECK_PLAINTEXT, grantKey, grantId);
    }

    verifyGrantKeyCheck(blob: GrantBlob, grantKey: Buffer, grantId: string): boolean {
        try {
            return this.decryptWithAad(blob, grantKey, grantId) === GRANT_KEY_CHECK_PLAINTEXT;
        } catch {
            return false;
        }
    }

    private encryptWithAad(plaintext: string, grantKey: Buffer, aad: string): GrantBlob {
        const iv = crypto.randomBytes(12);
        const cipher = crypto.createCipheriv("aes-256-gcm", grantKey, iv, { authTagLength: GRANT_AUTH_TAG_BYTES });
        cipher.setAAD(Buffer.from(aad, "utf8"));
        const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
        return {
            ciphertext: ct.toString("base64"),
            iv: iv.toString("base64"),
            authTag: cipher.getAuthTag().toString("base64"),
        };
    }

    private decryptWithAad(blob: GrantBlob, grantKey: Buffer, aad: string): string {
        try {
            const decipher = crypto.createDecipheriv("aes-256-gcm", grantKey, Buffer.from(blob.iv, "base64"), {
                authTagLength: GRANT_AUTH_TAG_BYTES,
            });
            decipher.setAAD(Buffer.from(aad, "utf8"));
            decipher.setAuthTag(Buffer.from(blob.authTag, "base64"));
            const pt = Buffer.concat([decipher.update(Buffer.from(blob.ciphertext, "base64")), decipher.final()]);
            return pt.toString("utf8");
        } catch {
            throw new GrantDecryptError();
        }
    }
}
