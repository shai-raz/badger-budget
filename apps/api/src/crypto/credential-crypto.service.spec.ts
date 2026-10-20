import { Test, TestingModule } from "@nestjs/testing";
import { UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { CredentialCryptoService, EncryptedBlob } from "./credential-crypto.service";

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
});
