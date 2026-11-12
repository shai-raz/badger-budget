import { Test, TestingModule } from "@nestjs/testing";
import { UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AUTO_SYNC_KEY_BYTES } from "@badger/shared-data";
import { CredentialCryptoService, EncryptedBlob, GrantBlob, GrantDecryptError } from "./credential-crypto.service";

describe("CredentialCryptoService", () => {
    let service: CredentialCryptoService;

    const mockConfigService = {
        get: jest.fn((key: string) => {
            if (key === "CREDENTIAL_ENCRYPTION_PEPPER") return "test-pepper-value";
            return undefined;
        }),
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                CredentialCryptoService,
                {
                    provide: ConfigService,
                    useValue: mockConfigService,
                },
            ],
        }).compile();

        service = module.get<CredentialCryptoService>(CredentialCryptoService);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    it("should be defined", () => {
        expect(service).toBeDefined();
    });

    describe("pepper", () => {
        it.each([undefined, "", "   "])("throws when CREDENTIAL_ENCRYPTION_PEPPER is %p", (value) => {
            const config = { get: jest.fn(() => value) } as unknown as ConfigService;

            expect(() => new CredentialCryptoService(config)).toThrow("CREDENTIAL_ENCRYPTION_PEPPER is not set");
        });
    });

    describe("encrypt and decrypt round-trip", () => {
        it("should decrypt to original plaintext with correct PIN", () => {
            const plaintext = "my secret credentials";
            const pin = "1234";

            const blob = service.encrypt(plaintext, pin);
            const result = service.decrypt(blob, pin);

            expect(result).toBe(plaintext);
        });

        it("should handle empty string plaintext", () => {
            const plaintext = "";
            const pin = "5678";

            const blob = service.encrypt(plaintext, pin);
            const result = service.decrypt(blob, pin);

            expect(result).toBe(plaintext);
        });

        it("should handle JSON plaintext", () => {
            const plaintext = JSON.stringify({ username: "user@bank.com", password: "s3cr3t!" });
            const pin = "mypin1234";

            const blob = service.encrypt(plaintext, pin);
            const result = service.decrypt(blob, pin);

            expect(result).toBe(plaintext);
        });
    });

    describe("decrypt with wrong PIN", () => {
        it("should throw UnauthorizedException when PIN is wrong", () => {
            const plaintext = "secret";
            const correctPin = "correct-pin";
            const wrongPin = "wrong-pin";

            const blob = service.encrypt(plaintext, correctPin);

            expect(() => service.decrypt(blob, wrongPin)).toThrow(UnauthorizedException);
        });

        it("should throw UnauthorizedException with message 'Invalid PIN'", () => {
            const blob = service.encrypt("data", "pin");

            expect(() => service.decrypt(blob, "bad-pin")).toThrow("Invalid PIN");
        });
    });

    describe("decrypt with tampered ciphertext", () => {
        it("should throw UnauthorizedException when ciphertext is tampered", () => {
            const blob = service.encrypt("sensitive data", "mypin");

            // Flip bytes in the ciphertext by decoding, modifying, and re-encoding
            const ctBytes = Buffer.from(blob.ciphertext, "base64");
            ctBytes[0] = ctBytes[0] ^ 0xff;
            const tamperedBlob: EncryptedBlob = {
                ...blob,
                ciphertext: ctBytes.toString("base64"),
            };

            expect(() => service.decrypt(tamperedBlob, "mypin")).toThrow(UnauthorizedException);
        });
    });

    describe("decrypt with tampered authTag", () => {
        it("should throw UnauthorizedException when authTag is tampered", () => {
            const blob = service.encrypt("sensitive data", "mypin");

            const tagBytes = Buffer.from(blob.authTag, "base64");
            tagBytes[0] = tagBytes[0] ^ 0xff;
            const tamperedBlob: EncryptedBlob = {
                ...blob,
                authTag: tagBytes.toString("base64"),
            };

            expect(() => service.decrypt(tamperedBlob, "mypin")).toThrow(UnauthorizedException);
        });
    });

    describe("encrypt randomness", () => {
        it("should produce different iv, salt, and ciphertext on each call with same input", () => {
            const plaintext = "same input";
            const pin = "same-pin";

            const blob1 = service.encrypt(plaintext, pin);
            const blob2 = service.encrypt(plaintext, pin);

            expect(blob1.iv).not.toBe(blob2.iv);
            expect(blob1.salt).not.toBe(blob2.salt);
            expect(blob1.ciphertext).not.toBe(blob2.ciphertext);
        });
    });

    describe("verifyPin", () => {
        it("should pass without throwing when PIN is correct", () => {
            const pin = "correct-pin";
            const verifier = service.createVerifier(pin);

            expect(() => service.verifyPin(verifier, pin)).not.toThrow();
        });

        it("should throw UnauthorizedException when PIN is wrong", () => {
            const verifier = service.createVerifier("correct-pin");

            expect(() => service.verifyPin(verifier, "wrong-pin")).toThrow(UnauthorizedException);
        });

        it("should throw UnauthorizedException with message 'Invalid PIN' when PIN is wrong", () => {
            const verifier = service.createVerifier("mypin");

            expect(() => service.verifyPin(verifier, "notmypin")).toThrow("Invalid PIN");
        });
    });

    describe("createVerifier", () => {
        it("should create a valid verifier blob", () => {
            const pin = "test-pin";
            const verifier = service.createVerifier(pin);

            expect(verifier).toHaveProperty("ciphertext");
            expect(verifier).toHaveProperty("iv");
            expect(verifier).toHaveProperty("authTag");
            expect(verifier).toHaveProperty("salt");
        });
    });
    describe("grant key crypto", () => {
        const grantId = "grant-1";
        const connectionId = "conn-1";
        const deviceKey = Buffer.alloc(AUTO_SYNC_KEY_BYTES, 7);
        const otherDeviceKey = Buffer.alloc(AUTO_SYNC_KEY_BYTES, 9);
        const plaintext = JSON.stringify({ username: "user@bank.com", password: "s3cr3t!" });

        const flipFirstByte = (b64: string): string => {
            const bytes = Buffer.from(b64, "base64");
            bytes[0] = bytes[0] ^ 0xff;
            return bytes.toString("base64");
        };

        it("round-trips plaintext with the same device key, grant id and connection id (AC1)", () => {
            const grantKey = service.deriveGrantKey(deviceKey, grantId);
            const blob = service.encryptForGrant(plaintext, grantKey, grantId, connectionId);

            expect(service.decryptForGrant(blob, grantKey, grantId, connectionId)).toBe(plaintext);
        });

        it("derives a 32-byte key that is deterministic for the same inputs", () => {
            const first = service.deriveGrantKey(deviceKey, grantId);
            const second = service.deriveGrantKey(deviceKey, grantId);

            expect(first.length).toBe(32);
            expect(first.equals(second)).toBe(true);
        });

        it("derives a different key for a different pepper", () => {
            const otherService = new CredentialCryptoService({
                get: () => "another-pepper-value",
            } as unknown as ConfigService);

            const a = service.deriveGrantKey(deviceKey, grantId);
            const b = otherService.deriveGrantKey(deviceKey, grantId);

            expect(a.equals(b)).toBe(false);
        });

        it("derives a different key for a different grant id", () => {
            expect(
                service.deriveGrantKey(deviceKey, "grant-1").equals(service.deriveGrantKey(deviceKey, "grant-2")),
            ).toBe(false);
        });

        it("throws GrantDecryptError when decrypting with a different device key", () => {
            const blob = service.encryptForGrant(
                plaintext,
                service.deriveGrantKey(deviceKey, grantId),
                grantId,
                connectionId,
            );
            const wrongKey = service.deriveGrantKey(otherDeviceKey, grantId);

            expect(() => service.decryptForGrant(blob, wrongKey, grantId, connectionId)).toThrow(GrantDecryptError);
        });

        it("throws GrantDecryptError when decrypting with a different grant id", () => {
            const grantKey = service.deriveGrantKey(deviceKey, grantId);
            const blob = service.encryptForGrant(plaintext, grantKey, grantId, connectionId);

            expect(() => service.decryptForGrant(blob, grantKey, "grant-2", connectionId)).toThrow(GrantDecryptError);
        });

        it("throws GrantDecryptError when decrypting with a different connection id", () => {
            const grantKey = service.deriveGrantKey(deviceKey, grantId);
            const blob = service.encryptForGrant(plaintext, grantKey, grantId, connectionId);

            expect(() => service.decryptForGrant(blob, grantKey, grantId, "conn-2")).toThrow(GrantDecryptError);
        });

        it("throws GrantDecryptError when the ciphertext is tampered", () => {
            const grantKey = service.deriveGrantKey(deviceKey, grantId);
            const blob = service.encryptForGrant(plaintext, grantKey, grantId, connectionId);
            const tampered: GrantBlob = { ...blob, ciphertext: flipFirstByte(blob.ciphertext) };

            expect(() => service.decryptForGrant(tampered, grantKey, grantId, connectionId)).toThrow(GrantDecryptError);
        });

        it("throws GrantDecryptError when the auth tag is tampered", () => {
            const grantKey = service.deriveGrantKey(deviceKey, grantId);
            const blob = service.encryptForGrant(plaintext, grantKey, grantId, connectionId);
            const tampered: GrantBlob = { ...blob, authTag: flipFirstByte(blob.authTag) };

            expect(() => service.decryptForGrant(tampered, grantKey, grantId, connectionId)).toThrow(GrantDecryptError);
        });

        it("rejects a truncated auth tag, so the key check cannot be forged with a short tag", () => {
            const grantKey = service.deriveGrantKey(deviceKey, grantId);
            const blob = service.encryptForGrant(plaintext, grantKey, grantId, connectionId);
            const truncated: GrantBlob = {
                ...blob,
                authTag: Buffer.from(blob.authTag, "base64").subarray(0, 4).toString("base64"),
            };

            expect(() => service.decryptForGrant(truncated, grantKey, grantId, connectionId)).toThrow(
                GrantDecryptError,
            );

            const check = service.createGrantKeyCheck(grantKey, grantId);
            const truncatedCheck: GrantBlob = {
                ...check,
                authTag: Buffer.from(check.authTag, "base64").subarray(0, 4).toString("base64"),
            };
            expect(service.verifyGrantKeyCheck(truncatedCheck, grantKey, grantId)).toBe(false);
        });

        it("rejects a device key of the wrong length", () => {
            expect(() => service.deriveGrantKey(Buffer.alloc(16, 1), grantId)).toThrow(GrantDecryptError);
            expect(() => service.deriveGrantKey(Buffer.alloc(AUTO_SYNC_KEY_BYTES + 1, 1), grantId)).toThrow(
                GrantDecryptError,
            );
        });

        it("verifies the key check for the right key and grant id (AC2)", () => {
            const grantKey = service.deriveGrantKey(deviceKey, grantId);
            const check = service.createGrantKeyCheck(grantKey, grantId);

            expect(service.verifyGrantKeyCheck(check, grantKey, grantId)).toBe(true);
        });

        it("rejects the key check for a wrong key or grant id without throwing (AC2)", () => {
            const grantKey = service.deriveGrantKey(deviceKey, grantId);
            const check = service.createGrantKeyCheck(grantKey, grantId);
            const wrongKey = service.deriveGrantKey(otherDeviceKey, grantId);

            expect(service.verifyGrantKeyCheck(check, wrongKey, grantId)).toBe(false);
            expect(service.verifyGrantKeyCheck(check, grantKey, "grant-2")).toBe(false);
        });

        it("keeps key material and plaintext out of error messages", () => {
            const grantKey = service.deriveGrantKey(deviceKey, grantId);
            const blob = service.encryptForGrant(plaintext, grantKey, grantId, connectionId);
            const wrongKey = service.deriveGrantKey(otherDeviceKey, grantId);

            const captured: Error[] = [];
            for (const attempt of [
                () => service.decryptForGrant(blob, wrongKey, grantId, connectionId),
                () => service.deriveGrantKey(Buffer.from(deviceKey.toString("hex").slice(0, 10), "hex"), grantId),
            ]) {
                try {
                    attempt();
                } catch (err) {
                    captured.push(err as Error);
                }
            }

            expect(captured).toHaveLength(2);
            const secrets = [
                deviceKey.toString("base64"),
                deviceKey.toString("hex"),
                grantKey.toString("base64"),
                grantKey.toString("hex"),
                plaintext,
            ];
            for (const err of captured) {
                expect(err.message).toBe("Auto-sync credentials could not be decrypted");
                for (const secret of secrets) {
                    expect(err.message).not.toContain(secret);
                }
            }
        });
    });
});
