import { IsNumber, IsPositive, IsUUID } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";

export class CreateReimbursementAllocationDto {
    @ApiProperty({ description: "The income transaction that pays back part of the expense" })
    @IsUUID()
    incomeId: string;

    @ApiProperty({ description: "The expense transaction being paid back" })
    @IsUUID()
    expenseId: string;

    @ApiProperty({ example: 150, description: "Amount of the expense covered by this income, 2 decimal places max" })
    @IsNumber({ maxDecimalPlaces: 2 })
    @IsPositive()
    @Type(() => Number)
    amount: number;
}
