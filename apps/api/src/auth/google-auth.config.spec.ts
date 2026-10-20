import { isGoogleAuthConfigured } from "./google-auth.config";

describe("isGoogleAuthConfigured", () => {
    it("is true when both client id and secret are set", () => {
        expect(isGoogleAuthConfigured({ GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: "secret" })).toBe(true);
    });

    it.each([
        ["client id missing", { GOOGLE_CLIENT_SECRET: "secret" }],
        ["client secret missing", { GOOGLE_CLIENT_ID: "id" }],
        ["both missing", {}],
        ["client id blank", { GOOGLE_CLIENT_ID: "   ", GOOGLE_CLIENT_SECRET: "secret" }],
        ["client secret empty", { GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: "" }],
    ])("is false when %s", (_label, env) => {
        expect(isGoogleAuthConfigured(env as NodeJS.ProcessEnv)).toBe(false);
    });
});
