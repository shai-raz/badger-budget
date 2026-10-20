import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as crypto from "crypto";

const VERIFIER_PLAINTEXT = "badger-sync-pin-verifier-v1";
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 };
const KEY_LEN = 32;

export interface EncryptedBlob {
    ciphertext: string; // base64
    iv: string; // base64
    authTag: string; // base64
    salt: string; // hex
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
}
