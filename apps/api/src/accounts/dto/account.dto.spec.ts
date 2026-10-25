import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { ACCOUNT_TYPES } from "@badger/shared-data";
import { CreateAccountDto, UpdateAccountDto } from "./account.dto";

const buildCreate = (extra: Record<string, unknown> = {}) =>
    plainToInstance(CreateAccountDto, { name: "Rainy day", type: "savings", ...extra });
const buildUpdate = (extra: Record<string, unknown> = {}) => plainToInstance(UpdateAccountDto, extra);

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
