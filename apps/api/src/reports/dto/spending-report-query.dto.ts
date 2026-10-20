import { IsDateString, IsOptional, IsString, Length, Matches } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";

export class SpendingReportQueryDto {
    @ApiProperty({
        example: "2026-07-01",
        description: "Inclusive start date (YYYY-MM-DD)",
    })
    // @IsDateString alone accepts any ISO-8601 value (e.g. a full timestamp),
    // which would defeat the month-alignment detection in getPreviousPeriod.
    @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: "startDate must be YYYY-MM-DD" })
    @IsDateString()
    startDate: string;

    @ApiProperty({
        example: "2026-07-31",
        description: "Inclusive end date (YYYY-MM-DD)",
    })
    @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: "endDate must be YYYY-MM-DD" })
    @IsDateString()
    endDate: string;

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
