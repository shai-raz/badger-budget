import { ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import {
    IsBoolean,
    IsDateString,
    IsIn,
    IsInt,
    IsOptional,
    IsString,
    IsUUID,
    Max,
    MaxLength,
    Min,
} from "class-validator";

/**
 * Query params for `GET /transactions`.
 *
 * Backward compatible: when `page` is absent the endpoint behaves exactly like
 * before (unpaginated array, no hidden filtering) and only the legacy filters
 * apply. When `page` is present the endpoint switches to a paginated response
 * and every new filter below becomes active.
 *
 * The global ValidationPipe runs with `whitelist + forbidNonWhitelisted +
 * transform + enableImplicitConversion`, so EVERY accepted param — including the
 * legacy ones — must be declared here or existing callers get a 400.
 */
export class ListTransactionsQueryDto {
    @ApiPropertyOptional({
        description: "1-based page number. When present, the response switches to the paginated shape.",
        minimum: 1,
    })
    @IsOptional()
    @IsInt()
    @Min(1)
    page?: number;

    @ApiPropertyOptional({
        description: "Page size (default 50). Only used when `page` is present.",
        minimum: 1,
        maximum: 100,
    })
    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(100)
    limit?: number;

    @ApiPropertyOptional({
        description: "Case-insensitive search across description, additionalDescription and category name.",
        maxLength: 200,
    })
    @IsOptional()
    @IsString()
    @MaxLength(200)
    search?: string;

    @ApiPropertyOptional({ enum: ["income", "expense", "transfer"] })
    @IsOptional()
    @IsIn(["income", "expense", "transfer"])
    type?: "income" | "expense" | "transfer";

    @ApiPropertyOptional({
        description:
            "CSV of category ids to filter by, e.g. `id1,id2`. The sentinel `uncategorized` matches transactions with no category. Omit to include all categories.",
        example: "id1,id2,uncategorized",
    })
    @IsOptional()
    @Transform(({ value }) => {
        if (typeof value === "string") {
            return value
                .split(",")
                .map((id) => id.trim())
                .filter((id) => id.length > 0);
        }
        if (Array.isArray(value)) {
            return value
                .map((id) => (typeof id === "string" ? id.trim() : id))
                .filter((id) => typeof id === "string" && id.length > 0);
        }
        return value;
    })
    @IsString({ each: true })
    categoryIds?: string[];

    @ApiPropertyOptional({
        description: "Inclusive lower bound on transactionDate (YYYY-MM-DD).",
        example: "2025-01-01",
    })
    @IsOptional()
    @IsDateString()
    startDate?: string;

    @ApiPropertyOptional({
        description: "Inclusive upper bound on transactionDate (YYYY-MM-DD).",
        example: "2025-12-31",
    })
    @IsOptional()
    @IsDateString()
    endDate?: string;

    @ApiPropertyOptional({
        description:
            "Only filters when explicitly `false` (hides hidden transactions). Absent or `true` reveals hidden transactions (legacy behavior).",
    })
    @IsOptional()
    // enableImplicitConversion coerces the string "false" to boolean true BEFORE
    // @Transform runs, so `value` is unusable here — read the raw query value
    // from `obj` instead. Map the four valid forms to a boolean and leave any
    // other value untouched so @IsBoolean below rejects it (400) rather than
    // silently treating garbage as `false`.
    @Transform(({ obj }) => {
        const raw = (obj as Record<string, unknown>).includeHidden;
        if (raw === undefined) return undefined;
        if (raw === true || raw === "true") return true;
        if (raw === false || raw === "false") return false;
        return raw;
    })
    @IsBoolean()
    includeHidden?: boolean;

    @ApiPropertyOptional({
        enum: ["transactionDate", "amount", "description", "createdAt"],
        default: "transactionDate",
    })
    @IsOptional()
    @IsIn(["transactionDate", "amount", "description", "createdAt"])
    sortBy?: "transactionDate" | "amount" | "description" | "createdAt";

    @ApiPropertyOptional({ enum: ["asc", "desc"], default: "desc" })
    @IsOptional()
    @IsIn(["asc", "desc"])
    sortOrder?: "asc" | "desc";

    // Legacy filters — kept for backward compatibility with existing callers
    // (store, dashboard, budgets detail page). IDs are DB-generated UUIDs.
    @ApiPropertyOptional()
    @IsOptional()
    @IsUUID()
    accountId?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsUUID()
    categoryId?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsUUID()
    budgetId?: string;
}
