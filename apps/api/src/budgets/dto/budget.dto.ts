import {
    IsString,
    IsNotEmpty,
    IsOptional,
    IsNumber,
    IsDateString,
    IsUUID,
    IsIn,
    IsInt,
    Max,
    IsArray,
    ArrayMinSize,
    ValidateIf,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";

export class CreateBudgetDto {
    @ApiProperty({ example: "Monthly Groceries" })
    @IsString()
    @IsNotEmpty()
    name: string;

    @ApiProperty({ example: 500.0 })
    @IsNumber()
    @Type(() => Number)
    amount: number;

    @ApiProperty({ example: "currency-uuid" })
    @IsUUID()
    currencyId: string;

    @ApiProperty({
        enum: ["daily", "weekly", "monthly", "yearly"],
        example: "monthly",
    })
    @IsIn(["daily", "weekly", "monthly", "yearly"])
    period: string;

    @ApiProperty({
        type: [String],
        description:
            "Canonical budget category linkage. At least one category is required. Overlap across budgets is allowed by design.",
        example: ["category-food-uuid", "category-groceries-uuid"],
    })
    @ValidateIf((o) => !o.categoryId)
    @IsArray()
    @ArrayMinSize(1)
    @IsUUID("4", { each: true })
    @IsOptional()
    categoryIds: string[];

    @ApiPropertyOptional({
        description:
            "Lifecycle start boundary. If omitted, budget is treated as active immediately. Period boundaries are evaluated in the user's timezone.",
        example: "2025-01-01",
    })
    @IsDateString()
    @IsOptional()
    startDate?: string;

    @ApiPropertyOptional({
        description: "Lifecycle end boundary (inclusive local date). If omitted, budget has no scheduled end.",
        example: "2025-12-31",
    })
    @IsDateString()
    @IsOptional()
    endDate?: string;

    @ApiPropertyOptional({
        description: "Deprecated legacy single-category field. Use categoryIds instead.",
        example: "category-uuid",
        deprecated: true,
    })
    @ValidateIf((o) => !o.categoryIds || o.categoryIds.length === 0)
    @IsUUID()
    @IsOptional()
    categoryId?: string;

    @ApiPropertyOptional({ example: "account-uuid" })
    @IsUUID()
    @IsOptional()
    accountId?: string;
}

export class BudgetPeriodQueryDto {
    @ApiPropertyOptional({
        enum: ["daily", "weekly", "monthly", "yearly"],
        description:
            "Filter the dashboard to a single period-type section. When provided, all budgets of that type are returned (including ended / not-yet-started ones) for the offset window.",
    })
    @IsIn(["daily", "weekly", "monthly", "yearly"])
    @IsOptional()
    period?: "daily" | "weekly" | "monthly" | "yearly";

    @ApiPropertyOptional({
        description:
            "How many whole periods to step back from the current period. 0 = current (default), -1 = previous period, etc. Positive values (future) are rejected.",
        example: -1,
        default: 0,
    })
    @Type(() => Number)
    @IsInt()
    @Max(0)
    @IsOptional()
    periodOffset?: number;
}

export class UpdateBudgetDto {
    @ApiPropertyOptional()
    @IsString()
    @IsOptional()
    name?: string;

    @ApiPropertyOptional()
    @IsNumber()
    @Type(() => Number)
    @IsOptional()
    amount?: number;

    @ApiPropertyOptional()
    @IsUUID()
    @IsOptional()
    currencyId?: string;

    @ApiPropertyOptional({ enum: ["daily", "weekly", "monthly", "yearly"] })
    @IsIn(["daily", "weekly", "monthly", "yearly"])
    @IsOptional()
    period?: string;

    @ApiPropertyOptional({
        type: [String],
        description: "Canonical category linkage for updates. If provided, list must contain at least one category ID.",
        example: ["category-food-uuid", "category-groceries-uuid"],
    })
    @IsArray()
    @ArrayMinSize(1)
    @IsUUID("4", { each: true })
    @IsOptional()
    categoryIds?: string[];

    @ApiPropertyOptional({
        description: "Lifecycle start boundary for this budget.",
    })
    @IsDateString()
    @IsOptional()
    startDate?: string;

    @ApiPropertyOptional({
        description: "Lifecycle end boundary for this budget (inclusive local date).",
    })
    @IsDateString()
    @IsOptional()
    endDate?: string;

    @ApiPropertyOptional({
        deprecated: true,
        description: "Deprecated legacy single-category field. Use categoryIds instead.",
    })
    @IsUUID()
    @IsOptional()
    categoryId?: string;

    @ApiPropertyOptional()
    @IsUUID()
    @IsOptional()
    accountId?: string;
}
