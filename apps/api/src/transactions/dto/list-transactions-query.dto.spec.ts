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

    describe("accountIds", () => {
        const ID_A = "11111111-1111-4111-8111-111111111111";
        const ID_B = "22222222-2222-4222-8222-222222222222";

        it("splits CSV and trims entries", () => {
            expect(fromQuery({ accountIds: `${ID_A}, ${ID_B} ,` }).accountIds).toEqual([ID_A, ID_B]);
        });

        it("trims and filters entries when arriving as an array (repeated query params)", () => {
            expect(fromQuery({ accountIds: [ID_A, ` ${ID_B} `, ""] }).accountIds).toEqual([ID_A, ID_B]);
        });

        it("passes validation for UUIDs", async () => {
            expect((await validate(fromQuery({ accountIds: `${ID_A},${ID_B}` }))).length).toBe(0);
        });

        it("fails validation for a non-UUID entry", async () => {
            const errors = await validate(fromQuery({ accountIds: `${ID_A},nope` }));
            expect(errors.some((e) => e.property === "accountIds")).toBe(true);
        });
    });

    describe("types", () => {
        it("splits CSV into typed values", () => {
            expect(fromQuery({ types: "income,transfer" }).types).toEqual(["income", "transfer"]);
        });

        it("passes validation for known types", async () => {
            expect((await validate(fromQuery({ types: "income,expense,transfer" }))).length).toBe(0);
        });

        it("fails validation for an unknown type", async () => {
            const errors = await validate(fromQuery({ types: "bogus" }));
            expect(errors.some((e) => e.property === "types")).toBe(true);
        });
    });

    describe("removed legacy params", () => {
        const strictValidate = (query: Record<string, unknown>) =>
            validate(fromQuery(query), { whitelist: true, forbidNonWhitelisted: true });

        it("rejects the removed accountId param", async () => {
            const errors = await strictValidate({ accountId: "11111111-1111-4111-8111-111111111111" });
            expect(errors.some((e) => e.property === "accountId")).toBe(true);
        });

        it("rejects the removed type param", async () => {
            const errors = await strictValidate({ type: "expense" });
            expect(errors.some((e) => e.property === "type")).toBe(true);
        });
    });
});
