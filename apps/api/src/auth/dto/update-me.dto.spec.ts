import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { COLOR_THEMES } from "@badger/shared-data";
import { UpdateMeDto } from "./update-me.dto";

const build = (body: Record<string, unknown>) => plainToInstance(UpdateMeDto, body);
const validateBody = (body: Record<string, unknown>) =>
    validate(build(body), { whitelist: true, forbidNonWhitelisted: true });

describe("UpdateMeDto", () => {
    it("accepts every shared colour theme", async () => {
        for (const colorTheme of COLOR_THEMES) {
            expect(await validateBody({ colorTheme })).toHaveLength(0);
        }
    });

    it("accepts null (resets to the default)", async () => {
        expect(await validateBody({ colorTheme: null })).toHaveLength(0);
    });

    it("accepts an empty body (nothing to change)", async () => {
        expect(await validateBody({})).toHaveLength(0);
    });

    it("rejects a colour theme outside the shared list", async () => {
        const errors = await validateBody({ colorTheme: "purple" });
        expect(errors.map((e) => e.property)).toContain("colorTheme");
    });

    it("rejects a non-string colour theme", async () => {
        const errors = await validateBody({ colorTheme: 42 });
        expect(errors.map((e) => e.property)).toContain("colorTheme");
    });

    it("rejects fields outside the DTO", async () => {
        const errors = await validateBody({ colorTheme: "ocean", role: "ADMIN" });
        expect(errors.length).toBeGreaterThan(0);
    });
});
