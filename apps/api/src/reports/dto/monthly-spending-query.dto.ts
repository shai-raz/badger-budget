import { IsOptional, IsString, Length, Matches } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";

export class MonthlySpendingQueryDto {
    @ApiProperty({
        example: "2026-01",
        description: "Inclusive first month (YYYY-MM)",
    })
    @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: "startMonth must be YYYY-MM" })
    startMonth: string;

    @ApiProperty({
        example: "2026-06",
        description: "Inclusive last month (YYYY-MM)",
    })
    @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: "endMonth must be YYYY-MM" })
    endMonth: string;

    @ApiPropertyOptional({
        example: "ILS",
        default: "ILS",
        description: "3-letter display currency code amounts are converted to",
    })
    @Transform(({ value }) => (typeof value === "string" ? value.toUpperCase() : value))
    @IsString()
    @Length(3, 3)
    @IsOptional()
    currency?: string;
}
