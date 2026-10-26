import { DEPLOY_WEBHOOK_TIMEOUT_MS, parseDeployWebhookConfig } from "./deploy-webhook-config";

const URL_VALUE = "https://hooks.example.test/deploy/hook-path";
const TOKEN_VALUE = "tok-7f3c9a1e-secret";
const BODY_VALUE = '{"ref":"main","reason":"upgrade-marker"}';

/** Asserts no warning echoes a supplied secret or value. */
function expectNoValueLeak(warnings: string[], values: string[]): void {
    for (const warning of warnings) {
        for (const value of values) {
            expect(warning).not.toContain(value);
        }
    }
}

describe("DEPLOY_WEBHOOK_TIMEOUT_MS", () => {
    it("is 15 seconds", () => {
        expect(DEPLOY_WEBHOOK_TIMEOUT_MS).toBe(15_000);
    });
});

describe("parseDeployWebhookConfig", () => {
    it("returns null with no warnings when DEPLOY_WEBHOOK_URL is unset or whitespace-only", () => {
        expect(parseDeployWebhookConfig({})).toEqual({ config: null, warnings: [] });
        expect(parseDeployWebhookConfig({ DEPLOY_WEBHOOK_URL: "   " })).toEqual({ config: null, warnings: [] });
    });

    it("disables the feature with a warning for an unparseable URL", () => {
        const result = parseDeployWebhookConfig({ DEPLOY_WEBHOOK_URL: "not a url" });
        expect(result.config).toBeNull();
        expect(result.warnings).toEqual(["DEPLOY_WEBHOOK_URL is not a valid http(s) URL; in-app upgrade is disabled"]);
        expectNoValueLeak(result.warnings, ["not a url"]);
    });

    it("disables the feature with a warning for a non-http(s) URL", () => {
        const ftpUrl = "ftp://files.example.test/deploy";
        const result = parseDeployWebhookConfig({ DEPLOY_WEBHOOK_URL: ftpUrl });
        expect(result.config).toBeNull();
        expect(result.warnings).toHaveLength(1);
        expect(result.warnings[0]).toContain("DEPLOY_WEBHOOK_URL");
        expectNoValueLeak(result.warnings, [ftpUrl]);
    });

    it("trims the URL and sends no auth header when only the URL is set", () => {
        const result = parseDeployWebhookConfig({ DEPLOY_WEBHOOK_URL: `  ${URL_VALUE}  ` });
        expect(result).toEqual({
            config: { url: URL_VALUE, headers: {}, body: undefined },
            warnings: [],
        });
    });

    it("sends a Bearer authorization header when a token is set without a header name", () => {
        const result = parseDeployWebhookConfig({
            DEPLOY_WEBHOOK_URL: URL_VALUE,
            DEPLOY_WEBHOOK_TOKEN: TOKEN_VALUE,
        });
        expect(result.config?.headers).toEqual({ authorization: `Bearer ${TOKEN_VALUE}` });
        expect(result.warnings).toEqual([]);
    });

    it("sends the raw token under a custom header and no authorization header", () => {
        const result = parseDeployWebhookConfig({
            DEPLOY_WEBHOOK_URL: URL_VALUE,
            DEPLOY_WEBHOOK_TOKEN: TOKEN_VALUE,
            DEPLOY_WEBHOOK_TOKEN_HEADER: "x-api-key",
        });
        expect(result.config?.headers).toEqual({ "x-api-key": TOKEN_VALUE });
        expect(result.config?.headers).not.toHaveProperty("authorization");
    });

    it("lower-cases a custom header name", () => {
        const result = parseDeployWebhookConfig({
            DEPLOY_WEBHOOK_URL: URL_VALUE,
            DEPLOY_WEBHOOK_TOKEN: TOKEN_VALUE,
            DEPLOY_WEBHOOK_TOKEN_HEADER: "X-Deploy-Key",
        });
        expect(result.config?.headers).toEqual({ "x-deploy-key": TOKEN_VALUE });
    });

    it("keeps a token that already carries a scheme unchanged under Authorization", () => {
        const result = parseDeployWebhookConfig({
            DEPLOY_WEBHOOK_URL: URL_VALUE,
            DEPLOY_WEBHOOK_TOKEN: "Token abc",
            DEPLOY_WEBHOOK_TOKEN_HEADER: "Authorization",
        });
        expect(result.config?.headers).toEqual({ authorization: "Token abc" });
    });

    it("prefixes a bare token with Bearer under AUTHORIZATION in any case", () => {
        const result = parseDeployWebhookConfig({
            DEPLOY_WEBHOOK_URL: URL_VALUE,
            DEPLOY_WEBHOOK_TOKEN: "abc",
            DEPLOY_WEBHOOK_TOKEN_HEADER: "AUTHORIZATION",
        });
        expect(result.config?.headers).toEqual({ authorization: "Bearer abc" });
    });

    it("ignores the token header when no token is set, without a warning", () => {
        const result = parseDeployWebhookConfig({
            DEPLOY_WEBHOOK_URL: URL_VALUE,
            DEPLOY_WEBHOOK_TOKEN_HEADER: "bad header",
        });
        expect(result).toEqual({
            config: { url: URL_VALUE, headers: {}, body: undefined },
            warnings: [],
        });
    });

    it("disables the feature with a warning for an invalid header name", () => {
        const result = parseDeployWebhookConfig({
            DEPLOY_WEBHOOK_URL: URL_VALUE,
            DEPLOY_WEBHOOK_TOKEN: TOKEN_VALUE,
            DEPLOY_WEBHOOK_TOKEN_HEADER: "bad header",
        });
        expect(result.config).toBeNull();
        expect(result.warnings).toEqual([
            "DEPLOY_WEBHOOK_TOKEN_HEADER is not a valid header name; in-app upgrade is disabled",
        ]);
        expectNoValueLeak(result.warnings, [URL_VALUE, TOKEN_VALUE, "bad header"]);
    });

    it("disables the feature with a warning when the URL embeds credentials", () => {
        const credentialedUrl = "https://user:pa55-secret@hooks.example.test/deploy/hook-path";
        const result = parseDeployWebhookConfig({ DEPLOY_WEBHOOK_URL: credentialedUrl });
        expect(result.config).toBeNull();
        expect(result.warnings).toEqual([
            "DEPLOY_WEBHOOK_URL must not contain credentials; use DEPLOY_WEBHOOK_TOKEN (and DEPLOY_WEBHOOK_TOKEN_HEADER) instead; in-app upgrade is disabled",
        ]);
        expectNoValueLeak(result.warnings, [credentialedUrl, "user", "pa55-secret"]);
    });

    it("disables the feature with a warning when the URL has only a username", () => {
        const result = parseDeployWebhookConfig({ DEPLOY_WEBHOOK_URL: "https://user@hooks.example.test/deploy" });
        expect(result.config).toBeNull();
        expect(result.warnings).toHaveLength(1);
        expect(result.warnings[0]).toContain("DEPLOY_WEBHOOK_URL must not contain credentials");
    });

    it("disables the feature with a warning when the token contains a line break or NUL", () => {
        for (const badToken of ["abc\r\ndef", "abc\ndef", "abc\0def"]) {
            const result = parseDeployWebhookConfig({
                DEPLOY_WEBHOOK_URL: URL_VALUE,
                DEPLOY_WEBHOOK_TOKEN: badToken,
                DEPLOY_WEBHOOK_TOKEN_HEADER: "x-api-key",
            });
            expect(result.config).toBeNull();
            expect(result.warnings).toEqual([
                "DEPLOY_WEBHOOK_TOKEN must not contain line breaks or NUL; in-app upgrade is disabled",
            ]);
            expectNoValueLeak(result.warnings, [badToken, "abc", "def"]);
        }
    });

    it("adds a JSON body and content-type when DEPLOY_WEBHOOK_BODY is valid JSON", () => {
        const result = parseDeployWebhookConfig({
            DEPLOY_WEBHOOK_URL: URL_VALUE,
            DEPLOY_WEBHOOK_BODY: `  ${BODY_VALUE}  `,
        });
        expect(result).toEqual({
            config: {
                url: URL_VALUE,
                headers: { "content-type": "application/json" },
                body: BODY_VALUE,
            },
            warnings: [],
        });
    });

    it("disables the feature with a warning when DEPLOY_WEBHOOK_BODY is not valid JSON", () => {
        const result = parseDeployWebhookConfig({
            DEPLOY_WEBHOOK_URL: URL_VALUE,
            DEPLOY_WEBHOOK_BODY: "{nope",
        });
        expect(result.config).toBeNull();
        expect(result.warnings).toEqual(["DEPLOY_WEBHOOK_BODY is not valid JSON; in-app upgrade is disabled"]);
        expectNoValueLeak(result.warnings, [URL_VALUE, "{nope"]);
    });

    it("sends no body and no content-type when DEPLOY_WEBHOOK_BODY is unset", () => {
        const result = parseDeployWebhookConfig({ DEPLOY_WEBHOOK_URL: URL_VALUE, DEPLOY_WEBHOOK_BODY: "  " });
        expect(result.config?.body).toBeUndefined();
        expect(result.config?.headers).not.toHaveProperty("content-type");
    });

    it("never echoes the token in warnings when the URL is invalid", () => {
        const result = parseDeployWebhookConfig({
            DEPLOY_WEBHOOK_URL: "::bad::",
            DEPLOY_WEBHOOK_TOKEN: TOKEN_VALUE,
        });
        expect(result.config).toBeNull();
        expectNoValueLeak(result.warnings, [TOKEN_VALUE, "::bad::"]);
    });
});
