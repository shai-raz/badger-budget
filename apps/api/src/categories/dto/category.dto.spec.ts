import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { AVATAR_ICON_NAMES } from "@badger/shared-data";
import { CreateCategoryDto, UpdateCategoryDto } from "./category.dto";

const buildCreate = (extra: Record<string, unknown> = {}) =>
    plainToInstance(CreateCategoryDto, { name: "Gym", color: "#4CAF50", ...extra });
const buildUpdate = (extra: Record<string, unknown> = {}) => plainToInstance(UpdateCategoryDto, extra);

describe("category DTO icon validation", () => {
    it("rejects an icon outside the registry on create", async () => {
        const errors = await validate(buildCreate({ icon: "not-an-icon" }));
        expect(errors.map((e) => e.property)).toContain("icon");
    });

    it("accepts a registry icon on create", async () => {
        expect(await validate(buildCreate({ icon: "coffee" }))).toHaveLength(0);
    });

    it("accepts every registry icon on create", async () => {
        for (const icon of AVATAR_ICON_NAMES) {
            expect(await validate(buildCreate({ icon }))).toHaveLength(0);
        }
    });

    it("accepts a create without an icon", async () => {
        expect(await validate(buildCreate())).toHaveLength(0);
    });

    it("accepts a null icon on update (clears it)", async () => {
        expect(await validate(buildUpdate({ icon: null }))).toHaveLength(0);
    });

    it("accepts a registry icon on update", async () => {
        expect(await validate(buildUpdate({ icon: "film" }))).toHaveLength(0);
    });

    it("rejects an icon outside the registry on update", async () => {
        const errors = await validate(buildUpdate({ icon: "not-an-icon" }));
        expect(errors.map((e) => e.property)).toContain("icon");
    });

    it("accepts an update without an icon", async () => {
        expect(await validate(buildUpdate({ name: "Renamed" }))).toHaveLength(0);
    });
});
