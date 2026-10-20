import { IsString, IsNotEmpty, IsOptional, IsNumber, IsBoolean, IsIn, Min } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";

export class CreateCategoryMappingRuleDto {
    @ApiProperty({ example: "category-uuid" })
    @IsString()
    @IsNotEmpty()
    categoryId: string;

    @ApiProperty({
        enum: ["description", "originalCategory", "amount"],
        example: "description",
    })
    @IsIn(["description", "originalCategory", "amount"])
    field: string;

    @ApiProperty({
        enum: ["contains", "equals", "startsWith", "endsWith", "greaterThan", "lessThan"],
        example: "contains",
    })
    @IsIn(["contains", "equals", "startsWith", "endsWith", "greaterThan", "lessThan"])
    operator: string;

    @ApiProperty({ example: "Starbucks" })
    @IsString()
    @IsNotEmpty()
    value: string;

    @ApiPropertyOptional({ example: 1 })
    @IsNumber()
    @Min(1)
    @Type(() => Number)
    @IsOptional()
    priority?: number;

    @ApiPropertyOptional({ example: false })
    @IsBoolean()
    @IsOptional()
    stopOnMatch?: boolean;
}

export class UpdateCategoryMappingRuleDto {
    @ApiPropertyOptional()
    @IsString()
    @IsOptional()
    categoryId?: string;

    @ApiPropertyOptional({ enum: ["description", "originalCategory", "amount"] })
    @IsIn(["description", "originalCategory", "amount"])
    @IsOptional()
    field?: string;

    @ApiPropertyOptional({
        enum: ["contains", "equals", "startsWith", "endsWith", "greaterThan", "lessThan"],
    })
    @IsIn(["contains", "equals", "startsWith", "endsWith", "greaterThan", "lessThan"])
    @IsOptional()
    operator?: string;

    @ApiPropertyOptional()
    @IsString()
    @IsOptional()
    value?: string;

    @ApiPropertyOptional()
    @IsNumber()
    @Min(1)
    @Type(() => Number)
    @IsOptional()
    priority?: number;

    @ApiPropertyOptional()
    @IsBoolean()
    @IsOptional()
    stopOnMatch?: boolean;
}
