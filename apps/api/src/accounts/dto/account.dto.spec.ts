import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { ACCOUNT_TYPES } from "@badger/shared-data";
import { CreateAccountDto, UpdateAccountDto } from "./account.dto";

const buildCreate = (extra: Record<string, unknown> = {}) =>
    plainToInstance(CreateAccountDto, { name: "Rainy day", type: "savings", ...extra });
const buildUpdate = (extra: Record<string, unknown> = {}) => plainToInstance(UpdateAccountDto, extra);
// Mirrors the global ValidationPipe, which converts implicitly before validating.
const buildUpdateImplicit = (extra: Record<string, unknown>) =>
    plainToInstance(UpdateAccountDto, extra, { enableImplicitConversion: true });
const strictOptions = { whitelist: true, forbidNonWhitelisted: true };

describe("account DTO account types", () => {
    it("accepts every shared account type on create", async () => {
        for (const type of ACCOUNT_TYPES) {
            expect(await validate(buildCreate({ type }))).toHaveLength(0);
        }
    });

    it("rejects an unknown type on create", async () => {
        const errors = await validate(buildCreate({ type: "bogus" }));
        expect(errors.map((e) => e.property)).toContain("type");
    });

    it("accepts savings on update", async () => {
        expect(await validate(buildUpdate({ type: "savings" }))).toHaveLength(0);
    });

    it("rejects an unknown type on update", async () => {
        const errors = await validate(buildUpdate({ type: "bogus" }));
        expect(errors.map((e) => e.property)).toContain("type");
    });

    it("keeps existing types valid on update", async () => {
        for (const type of ["credit_card", "bank", "cash", "unknown"]) {
            expect(await validate(buildUpdate({ type }))).toHaveLength(0);
        }
    });
});

describe("account DTO icon validation", () => {
    it("rejects an icon outside the registry on create", async () => {
        const errors = await validate(buildCreate({ icon: "not-an-icon" }));
        expect(errors.map((e) => e.property)).toContain("icon");
    });

    it("accepts a registry icon on create", async () => {
        expect(await validate(buildCreate({ icon: "credit-card" }))).toHaveLength(0);
    });

    it("accepts an account create without an icon", async () => {
        expect(await validate(buildCreate())).toHaveLength(0);
    });

    it("accepts a null icon on update (clears it)", async () => {
        expect(await validate(buildUpdate({ icon: null }))).toHaveLength(0);
    });

    it("rejects an icon outside the registry on update", async () => {
        const errors = await validate(buildUpdate({ icon: "not-an-icon" }));
        expect(errors.map((e) => e.property)).toContain("icon");
    });
});

describe("account DTO hiddenOnOverview validation", () => {
    it.each([true, false])("accepts a boolean %s on update", async (hiddenOnOverview) => {
        expect(await validate(buildUpdateImplicit({ hiddenOnOverview }), strictOptions)).toHaveLength(0);
    });

    it.each(["false", "true", 1, 0, null])("rejects the non-boolean %p on update", async (hiddenOnOverview) => {
        const errors = await validate(buildUpdateImplicit({ hiddenOnOverview }), strictOptions);
        expect(errors.map((e) => e.property)).toContain("hiddenOnOverview");
        expect(errors[0].constraints).toHaveProperty("isBoolean");
    });

    it("accepts an update without hiddenOnOverview", async () => {
        expect(await validate(buildUpdateImplicit({ name: "Checking" }), strictOptions)).toHaveLength(0);
    });

    it("does not accept hiddenOnOverview on create", async () => {
        const dto = plainToInstance(CreateAccountDto, { name: "Rainy day", type: "savings", hiddenOnOverview: true });
        const errors = await validate(dto, strictOptions);
        expect(errors.map((e) => e.property)).toContain("hiddenOnOverview");
    });
});
