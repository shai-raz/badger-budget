import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { AccountFacetsQueryDto } from "./account-facets-query.dto";
import { TypeFacetsQueryDto } from "./type-facets-query.dto";

const ID_A = "11111111-1111-4111-8111-111111111111";

// The global ValidationPipe runs with whitelist + forbidNonWhitelisted, so a facet
// endpoint must reject its own selection key rather than silently ignoring it.
const strictErrors = <T extends object>(dto: new () => T, query: Record<string, unknown>) =>
    validate(plainToInstance(dto, query, { enableImplicitConversion: true }), {
        whitelist: true,
        forbidNonWhitelisted: true,
    });

describe("AccountFacetsQueryDto", () => {
    it("rejects its own selection, accountIds", async () => {
        const errors = await strictErrors(AccountFacetsQueryDto, { accountIds: ID_A });
        expect(errors.some((e) => e.property === "accountIds")).toBe(true);
    });

    it("rejects paging and sort params", async () => {
        const errors = await strictErrors(AccountFacetsQueryDto, { page: 1, sortBy: "amount" });
        expect(errors.map((e) => e.property)).toEqual(expect.arrayContaining(["page", "sortBy"]));
    });

    it("accepts the other list filters", async () => {
        const errors = await strictErrors(AccountFacetsQueryDto, {
            search: "rent",
            types: "expense",
            categoryIds: "c1,uncategorized",
            includeHidden: "false",
        });
        expect(errors).toHaveLength(0);
    });
});

describe("TypeFacetsQueryDto", () => {
    it("rejects its own selection, types", async () => {
        const errors = await strictErrors(TypeFacetsQueryDto, { types: "expense" });
        expect(errors.some((e) => e.property === "types")).toBe(true);
    });

    it("rejects paging and sort params", async () => {
        const errors = await strictErrors(TypeFacetsQueryDto, { limit: 10, sortOrder: "asc" });
        expect(errors.map((e) => e.property)).toEqual(expect.arrayContaining(["limit", "sortOrder"]));
    });

    it("accepts the other list filters", async () => {
        const errors = await strictErrors(TypeFacetsQueryDto, {
            accountIds: ID_A,
            search: "rent",
            startDate: "2025-01-01",
            includeHidden: "true",
        });
        expect(errors).toHaveLength(0);
    });
});
