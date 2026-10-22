import { DECORATORS } from "@nestjs/swagger/dist/constants";

// SWC does not emit `design:type` for `T | null` properties, so every nullable response property
// needs an explicit `type` on @ApiProperty to keep /api/docs-json identical to the tsc build.
// The Jest transform may emit String/Date for those properties, which would hide a missing `type`.
// Reload the DTOs with `design:type` forced to Object, as SWC emits, so the check does not depend on the transform.
const loadWithSwcDesignTypes = <T>(load: () => T): T => {
    let loaded!: T;
    jest.isolateModules(() => {
        // reflect-metadata reinstalls Reflect.metadata whenever it is evaluated, so evaluate it before wrapping.
        jest.requireActual("reflect-metadata");
        const metadata = Reflect.metadata;
        Reflect.metadata = (key, value) => metadata(key, key === "design:type" ? Object : value);
        loaded = load();
        Reflect.metadata = metadata;
    });
    return loaded;
};

const dtos = loadWithSwcDesignTypes(() => ({
    account: jest.requireActual<typeof import("./account-response.dto")>("./account-response.dto"),
    budget: jest.requireActual<typeof import("./budget-response.dto")>("./budget-response.dto"),
    category: jest.requireActual<typeof import("./category-response.dto")>("./category-response.dto"),
    transaction: jest.requireActual<typeof import("./transaction-response.dto")>("./transaction-response.dto"),
    sheetConnection: jest.requireActual<typeof import("../../google-sheets/dto/sheet-connection.dto")>(
        "../../google-sheets/dto/sheet-connection.dto",
    ),
}));

const apiPropertyOf = (target: object, property: string) =>
    Reflect.getMetadata(DECORATORS.API_MODEL_PROPERTIES, target, property) as { type: unknown; nullable?: boolean };

const rows = [
    ...["additionalDescription", "originalCategory", "externalId", "budgetId", "categoryId", "counterpartOfId"].map(
        (property) => ({ dto: dtos.transaction.TransactionResponseDto, property, type: String }),
    ),
    ...["postedDate", "deletedAt"].map((property) => ({
        dto: dtos.transaction.TransactionResponseDto,
        property,
        type: Date,
    })),
    { dto: dtos.transaction.TransactionResponseDto, property: "reimbursement", type: Object },
    ...["icon", "color"].map((property) => ({ dto: dtos.account.AccountResponseDto, property, type: String })),
    { dto: dtos.category.CategoryResponseDto, property: "icon", type: String },
    ...["startDate", "endDate", "deletedAt"].map((property) => ({
        dto: dtos.budget.BudgetResponseDto,
        property,
        type: Date,
    })),
    { dto: dtos.sheetConnection.SheetConnectionDto, property: "lastSyncedAt", type: Date },
];

describe("response DTO Swagger metadata", () => {
    it.each(rows)("$dto.name / $property documents its type and nullability", ({ dto, property, type }) => {
        expect(apiPropertyOf(dto.prototype, property)).toEqual(expect.objectContaining({ type, nullable: true }));
    });
});
