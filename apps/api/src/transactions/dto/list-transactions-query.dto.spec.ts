import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { ListTransactionsQueryDto } from "./list-transactions-query.dto";

// Mirrors the global ValidationPipe's transform options (main.ts):
// transform + enableImplicitConversion. The implicit conversion is exactly what
// makes boolean query params treacherous — Boolean("false") === true — so these
// tests run through the same code path as a real request.
const fromQuery = (query: Record<string, unknown>) =>
    plainToInstance(ListTransactionsQueryDto, query, { enableImplicitConversion: true });

describe("ListTransactionsQueryDto", () => {
    describe("includeHidden", () => {
        it('parses "false" as false (not Boolean-coerced to true)', () => {
            expect(fromQuery({ includeHidden: "false" }).includeHidden).toBe(false);
        });

        it('parses "true" as true', () => {
            expect(fromQuery({ includeHidden: "true" }).includeHidden).toBe(true);
        });

        it("stays undefined when absent (legacy behavior)", () => {
            expect(fromQuery({}).includeHidden).toBeUndefined();
        });

        it("fails validation for a value other than true/false", async () => {
            const errors = await validate(fromQuery({ includeHidden: "garbage" }));
            expect(errors.some((e) => e.property === "includeHidden")).toBe(true);
        });

        it("passes validation for valid forms (true, false, absent)", async () => {
            expect((await validate(fromQuery({ includeHidden: "true" }))).length).toBe(0);
            expect((await validate(fromQuery({ includeHidden: "false" }))).length).toBe(0);
            expect((await validate(fromQuery({}))).length).toBe(0);
        });
    });

    describe("categoryIds", () => {
        it("splits CSV and trims entries", () => {
            expect(fromQuery({ categoryIds: "a, b ,uncategorized" }).categoryIds).toEqual(["a", "b", "uncategorized"]);
        });

        it("drops empty entries", () => {
            expect(fromQuery({ categoryIds: "a,," }).categoryIds).toEqual(["a"]);
        });

        it("trims and filters entries when arriving as an array (repeated query params)", () => {
            expect(fromQuery({ categoryIds: ["a", " b ", "", "uncategorized"] }).categoryIds).toEqual([
                "a",
                "b",
                "uncategorized",
            ]);
        });
    });
});
