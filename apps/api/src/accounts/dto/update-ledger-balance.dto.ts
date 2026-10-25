import { IsDateString, IsNumber, Min } from "class-validator";
import { Type } from "class-transformer";
import { ApiProperty } from "@nestjs/swagger";

export class UpdateLedgerBalanceDto {
    @ApiProperty({ example: 20, description: "The cash amount the user actually has on hand now." })
    @Type(() => Number)
    @IsNumber()
    @Min(0)
    amount: number;

    @ApiProperty({
        example: "2026-05-14",
        description: "The user's local calendar day (YYYY-MM-DD); used as the adjustment's transaction date.",
    })
    @IsDateString()
    date: string;
}
