import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { UNMATCHED_IMPORT_CATEGORY_MODES } from "@badger/shared-data";
import { UpdateUserSettingsDto } from "./update-user-settings.dto";

const build = (body: Record<string, unknown>) => plainToInstance(UpdateUserSettingsDto, body);
const validateBody = (body: Record<string, unknown>) =>
    validate(build(body), { whitelist: true, forbidNonWhitelisted: true });

describe("UpdateUserSettingsDto", () => {
    it("accepts every shared unmatched-import-category mode", async () => {
        for (const unmatchedImportCategory of UNMATCHED_IMPORT_CATEGORY_MODES) {
            expect(await validateBody({ unmatchedImportCategory })).toHaveLength(0);
        }
    });

    it("accepts an empty body (nothing to change)", async () => {
        expect(await validateBody({})).toHaveLength(0);
    });

    it("rejects null (an explicit null is not 'unchanged')", async () => {
        const errors = await validateBody({ unmatchedImportCategory: null });
        expect(errors.map((e) => e.property)).toContain("unmatchedImportCategory");
    });

    it("rejects a mode outside the shared list", async () => {
        const errors = await validateBody({ unmatchedImportCategory: "bogus" });
        expect(errors.map((e) => e.property)).toContain("unmatchedImportCategory");
    });

    it("rejects fields outside the DTO", async () => {
        const errors = await validateBody({ unmatchedImportCategory: "reuse_only", role: "ADMIN" });
        expect(errors.length).toBeGreaterThan(0);
    });
});
