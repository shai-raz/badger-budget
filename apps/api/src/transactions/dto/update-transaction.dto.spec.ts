import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { TRANSACTION_ADDITIONAL_DESCRIPTION_MAX_LENGTH, TRANSACTION_NOTES_MAX_LENGTH } from "@badger/shared-data";
import { UpdateTransactionDto } from "./update-transaction.dto";

const build = (body: Record<string, unknown> = {}) => plainToInstance(UpdateTransactionDto, body);

describe("UpdateTransactionDto", () => {
    it("accepts an empty object", async () => {
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

        it("rejects non-string notes", async () => {
            const errors = await validate(build({ notes: 123 }));
            expect(errors.map((e) => e.property)).toContain("notes");
        });

        it("accepts null notes (IsOptional)", async () => {
            expect(await validate(build({ notes: null }))).toHaveLength(0);
        });

        it("is whitelisted", async () => {
            const errors = await validate(build({ notes: "hi" }), { whitelist: true, forbidNonWhitelisted: true });
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
