import { plainToInstance } from "class-transformer";
import { validate, ValidationError } from "class-validator";
import { CreateRuleDto, ReorderRulesDto, SetRuleActiveDto, UpdateRuleDto } from "./rule.dto";

const CATEGORY_ID = "55555555-5555-4555-8555-555555555555";
const RULE_ID = "11111111-1111-4111-8111-111111111111";

// Lists "path:constraint" for every failure, including nested ones, so assertions can name the exact field.
function failures(errors: ValidationError[], prefix = ""): string[] {
    return errors.flatMap((error) => {
        const path = prefix + error.property;
        const own = Object.keys(error.constraints ?? {}).map((key) => path + ":" + key);
        return [...own, ...failures(error.children ?? [], path + ".")];
    });
}

// The global ValidationPipe runs with whitelist and forbidNonWhitelisted, so the spec does too.
const strict = { whitelist: true, forbidNonWhitelisted: true };

const validBody = (): Record<string, unknown> => ({
    name: "Coffee",
    conditions: [{ field: "description", operator: "contains", value: "starbucks" }],
    actions: [{ type: "set_category", value: CATEGORY_ID }],
});

const buildCreate = (extra: Record<string, unknown> = {}) =>
    plainToInstance(CreateRuleDto, { ...validBody(), ...extra });
const buildUpdate = (extra: Record<string, unknown> = {}) =>
    plainToInstance(UpdateRuleDto, { ...validBody(), stopOnMatch: false, ...extra });

describe("CreateRuleDto", () => {
    it("accepts a valid body without stopOnMatch or apply", async () => {
        expect(await validate(buildCreate(), strict)).toHaveLength(0);
    });

    it("accepts stopOnMatch and an apply selection", async () => {
        const body = buildCreate({ stopOnMatch: true, apply: { mode: "only", ids: [RULE_ID] } });
        expect(await validate(body, strict)).toHaveLength(0);
    });

    it("rejects an unknown condition field", async () => {
        const body = buildCreate({ conditions: [{ field: "payee", operator: "contains", value: "x" }] });
        expect(failures(await validate(body, strict))).toContain("conditions.0.field:isIn");
    });

    it("rejects an unknown operator", async () => {
        const body = buildCreate({ conditions: [{ field: "description", operator: "regex", value: "x" }] });
        expect(failures(await validate(body, strict))).toContain("conditions.0.operator:isIn");
    });

    it("rejects a condition value over the length limit", async () => {
        const body = buildCreate({
            conditions: [{ field: "description", operator: "contains", value: "x".repeat(501) }],
        });
        expect(failures(await validate(body, strict))).toContain("conditions.0.value:maxLength");
    });

    it("rejects an empty conditions list", async () => {
        expect(failures(await validate(buildCreate({ conditions: [] }), strict))).toContain("conditions:arrayMinSize");
    });

    it("rejects an empty actions list", async () => {
        expect(failures(await validate(buildCreate({ actions: [] }), strict))).toContain("actions:arrayMinSize");
    });

    it("rejects an unknown action type", async () => {
        const body = buildCreate({ actions: [{ type: "archive", value: CATEGORY_ID }] });
        expect(failures(await validate(body, strict))).toContain("actions.0.type:isIn");
    });

    it("rejects an unknown field nested inside a condition", async () => {
        const body = buildCreate({
            conditions: [{ field: "description", operator: "contains", value: "x", bogus: 1 }],
        });
        expect(failures(await validate(body, strict))).toContain("conditions.0.bogus:whitelistValidation");
    });

    it("rejects an unknown top-level field", async () => {
        expect(failures(await validate(buildCreate({ extra: true }), strict))).toContain("extra:whitelistValidation");
    });

    it("rejects a blank name and a name over the limit", async () => {
        expect(failures(await validate(buildCreate({ name: "" }), strict))).toContain("name:isNotEmpty");
        expect(failures(await validate(buildCreate({ name: "a".repeat(201) }), strict))).toContain("name:maxLength");
    });

    it("rejects a stopOnMatch that is not a boolean", async () => {
        expect(failures(await validate(buildCreate({ stopOnMatch: "yes" }), strict))).toContain(
            "stopOnMatch:isBoolean",
        );
    });

    it("rejects an unknown apply mode", async () => {
        const body = buildCreate({ apply: { mode: "some", ids: [RULE_ID] } });
        expect(failures(await validate(body, strict))).toContain("apply.mode:isIn");
    });

    it("rejects apply ids that are not UUIDs", async () => {
        const body = buildCreate({ apply: { mode: "allExcept", ids: ["not-a-uuid"] } });
        expect(failures(await validate(body, strict))).toContain("apply.ids:isUuid");
    });

    it("rejects more than 20000 apply ids", async () => {
        const ids = Array.from({ length: 20001 }, () => RULE_ID);
        const body = buildCreate({ apply: { mode: "allExcept", ids } });
        expect(failures(await validate(body, strict))).toContain("apply.ids:arrayMaxSize");
    });
});

describe("UpdateRuleDto", () => {
    it("accepts a valid body with stopOnMatch", async () => {
        expect(await validate(buildUpdate({ stopOnMatch: true }), strict)).toHaveLength(0);
    });

    it("requires stopOnMatch", async () => {
        const body = plainToInstance(UpdateRuleDto, validBody());
        expect(failures(await validate(body, strict))).toContain("stopOnMatch:isBoolean");
    });

    it("still rejects nested unknown fields", async () => {
        const body = buildUpdate({ actions: [{ type: "set_category", value: CATEGORY_ID, extra: 1 }] });
        expect(failures(await validate(body, strict))).toContain("actions.0.extra:whitelistValidation");
    });
});

describe("SetRuleActiveDto", () => {
    it("requires a boolean isActive", async () => {
        expect(await validate(plainToInstance(SetRuleActiveDto, { isActive: false }), strict)).toHaveLength(0);
        expect(failures(await validate(plainToInstance(SetRuleActiveDto, { isActive: "yes" }), strict))).toContain(
            "isActive:isBoolean",
        );
    });
});

describe("ReorderRulesDto", () => {
    it("accepts a non-empty list of UUIDs", async () => {
        expect(await validate(plainToInstance(ReorderRulesDto, { ids: [RULE_ID] }), strict)).toHaveLength(0);
    });

    it("rejects an empty list and non-UUID ids", async () => {
        expect(failures(await validate(plainToInstance(ReorderRulesDto, { ids: [] }), strict))).toContain(
            "ids:arrayMinSize",
        );
        expect(failures(await validate(plainToInstance(ReorderRulesDto, { ids: ["nope"] }), strict))).toContain(
            "ids:isUuid",
        );
    });
});
