import { generateVAPIDKeys } from "web-push";
import { DEFAULT_VAPID_SUBJECT, deriveVapidPublicKey, resolveVapidConfig, resolveVapidSubject } from "./vapid";

const INVALID_KEY = /VAPID_PRIVATE_KEY is not a valid P-256 private key/;

describe("deriveVapidPublicKey", () => {
    it("matches the public key web-push generates for the same private key", () => {
        const { publicKey, privateKey } = generateVAPIDKeys();

        expect(deriveVapidPublicKey(privateKey)).toBe(publicKey);
    });

    it("returns the same uncompressed 65-byte point on every call", () => {
        const { privateKey } = generateVAPIDKeys();

        const first = deriveVapidPublicKey(privateKey);
        expect(deriveVapidPublicKey(privateKey)).toBe(first);
        const point = Buffer.from(first, "base64url");
        expect(point).toHaveLength(65);
        expect(point[0]).toBe(0x04);
    });

    it.each([
        ["garbage", "not a key!"],
        ["empty", ""],
        ["31 bytes", Buffer.alloc(31, 7).toString("base64url")],
        ["33 bytes", Buffer.alloc(33, 7).toString("base64url")],
    ])("rejects a %s key without echoing it", (_label, key) => {
        expect(() => deriveVapidPublicKey(key)).toThrow(INVALID_KEY);
        try {
            deriveVapidPublicKey(key);
        } catch (err) {
            if (key) expect((err as Error).message).not.toContain(key);
        }
    });
});

describe("resolveVapidSubject", () => {
    it("uses VAPID_SUBJECT when it starts with mailto: or https:", () => {
        expect(resolveVapidSubject({ VAPID_SUBJECT: " mailto:ops@example.org " })).toBe("mailto:ops@example.org");
        expect(resolveVapidSubject({ VAPID_SUBJECT: "https://budget.example.org" })).toBe("https://budget.example.org");
    });

    it("throws on a VAPID_SUBJECT with any other scheme", () => {
        expect(() => resolveVapidSubject({ VAPID_SUBJECT: "http://budget.example.org" })).toThrow(
            "VAPID_SUBJECT must start with mailto: or https:",
        );
    });

    it("uses the origin of an https PUBLIC_URL", () => {
        expect(resolveVapidSubject({ PUBLIC_URL: "https://budget.example.org/app/" })).toBe(
            "https://budget.example.org",
        );
    });

    it.each([
        ["an http PUBLIC_URL", "http://budget.example.org"],
        ["an https localhost PUBLIC_URL", "https://localhost:8080"],
        ["an https 127.0.0.1 PUBLIC_URL", "https://127.0.0.1:8080"],
        ["an https [::1] PUBLIC_URL", "https://[::1]:8080"],
        ["an https .localhost PUBLIC_URL", "https://budget.localhost"],
        ["an https .local PUBLIC_URL", "https://budget.local"],
        ["a PUBLIC_URL that is not a URL", "budget"],
    ])("falls back to the project URL for %s", (_label, publicUrl) => {
        expect(resolveVapidSubject({ PUBLIC_URL: publicUrl })).toBe(DEFAULT_VAPID_SUBJECT);
    });

    it("falls back to the project URL when nothing is set", () => {
        expect(resolveVapidSubject({})).toBe(DEFAULT_VAPID_SUBJECT);
    });
});

describe("resolveVapidConfig", () => {
    it("returns the derived public key, the private key and the resolved subject", () => {
        const { publicKey, privateKey } = generateVAPIDKeys();

        expect(resolveVapidConfig({ VAPID_PRIVATE_KEY: privateKey, PUBLIC_URL: "https://budget.example.org" })).toEqual(
            {
                publicKey,
                privateKey,
                subject: "https://budget.example.org",
            },
        );
    });

    it("throws the invalid-key error when VAPID_PRIVATE_KEY is missing", () => {
        expect(() => resolveVapidConfig({})).toThrow(INVALID_KEY);
    });
});
