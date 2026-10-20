import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { TRANSACTION_ADDITIONAL_DESCRIPTION_MAX_LENGTH, TRANSACTION_NOTES_MAX_LENGTH } from "@badger/shared-data";
import { CreateTransactionDto } from "./create-transaction.dto";

const base = {
    accountId: "6f1c1f0e-3b0a-4c55-9f6e-0c7b1f2a3d41",
    currencyId: "0a8d5b52-7c1e-4f3a-8d2b-9e4c6a1b7f30",
    type: "expense",
    amount: 10,
    description: "Coffee",
    transactionDate: "2026-10-09",
};

const build = (extra: Record<string, unknown> = {}) => plainToInstance(CreateTransactionDto, { ...base, ...extra });

describe("CreateTransactionDto", () => {
    it("pins the configured length limits", () => {
        expect(TRANSACTION_ADDITIONAL_DESCRIPTION_MAX_LENGTH).toBe(150);
        expect(TRANSACTION_NOTES_MAX_LENGTH).toBe(1000);
    });

    it("accepts a valid base object", async () => {
        expect(await validate(build())).toHaveLength(0);
    });

    describe("notes", () => {
        it("accepts notes at the max length", async () => {
            expect(await validate(build({ notes: "a".repeat(TRANSACTION_NOTES_MAX_LENGTH) }))).toHaveLength(0);
        });

        it("rejects notes over the max length", async () => {
            const errors = await validate(build({ notes: "a".repeat(TRANSACTION_NOTES_MAX_LENGTH + 1) }));
            expect(errors.map((e) => e.property)).toContain("notes");
        });

        it("accepts absent notes", async () => {
            expect(await validate(build())).toHaveLength(0);
        });

        it("rejects non-string notes", async () => {
            const errors = await validate(build({ notes: 123 }));
            expect(errors.map((e) => e.property)).toContain("notes");
        });

        it("is whitelisted (not stripped/forbidden)", async () => {
            const errors = await validate(build({ notes: "hello" }), { whitelist: true, forbidNonWhitelisted: true });
            expect(errors).toHaveLength(0);
        });
    });

    describe("additionalDescription", () => {
        it("accepts the max length", async () => {
            const dto = build({ additionalDescription: "a".repeat(TRANSACTION_ADDITIONAL_DESCRIPTION_MAX_LENGTH) });
            expect(await validate(dto)).toHaveLength(0);
        });

        it("rejects over the max length", async () => {
            const dto = build({
                additionalDescription: "a".repeat(TRANSACTION_ADDITIONAL_DESCRIPTION_MAX_LENGTH + 1),
            });
            const errors = await validate(dto);
            expect(errors.map((e) => e.property)).toContain("additionalDescription");
        });
    });
});
